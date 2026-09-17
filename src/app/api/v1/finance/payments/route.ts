import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, workshopOrProjectScopeFilter } from '@/lib/scope'
import { computePaymentInfo } from '@/lib/finance'
import { createPaymentSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { tehranDayStart } from '@/lib/daily'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/finance/payments — دفتر پرداخت‌ها ───────────────────────────

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)
    const url = req.nextUrl
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20') || 20))
    const purchaseId = url.searchParams.get('purchaseId')

    const and: Prisma.PaymentWhereInput[] = [{ purchase: workshopOrProjectScopeFilter(scope) as Prisma.PurchaseRequestWhereInput }]
    if (purchaseId) and.push({ purchaseId })

    const where: Prisma.PaymentWhereInput = { AND: and }

    const [total, payments] = await Promise.all([
      db.payment.count({ where }),
      db.payment.findMany({
        where,
        include: {
          createdBy: { select: { fullName: true } },
          purchase: {
            select: {
              id: true,
              number: true,
              supplierName: true,
              totalAmount: true,
              workshop: { select: { name: true } },
              payments: { select: { amount: true } },
            },
          },
        },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return ok({
      payments: payments.map((pay) => ({
        id: pay.id,
        amount: pay.amount.toString(),
        paidAt: pay.paidAt.toISOString(),
        method: pay.method,
        referenceNo: pay.referenceNo,
        note: pay.note,
        createdByName: pay.createdBy.fullName,
        purchaseId: pay.purchase.id,
        purchaseNumber: pay.purchase.number,
        supplierName: pay.purchase.supplierName,
        workshopName: pay.purchase.workshop.name,
        purchaseTotal: pay.purchase.totalAmount?.toString() ?? null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  },
  { permission: 'finance.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'finance' } }
)

// ─────────────────────────── POST /api/v1/finance/payments — ثبت پرداخت روی خرید ───────────────────────────

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const { purchaseId, amount, paidAt, method, referenceNo, note } = body
    const scope = await getUserScope(user)

    const purchase = await db.purchaseRequest.findUnique({
      where: { id: purchaseId },
      include: { payments: { select: { amount: true } } },
    })
    if (!purchase) throw new ApiError(404, 'NOT_FOUND', 'خرید یافت نشد.')

    // دسترسی Scope — مانع IDOR بین کارگاه‌ها
    const inScope =
      scope.isGlobal ||
      scope.workshopIds.includes(purchase.workshopId) ||
      (purchase.projectId && scope.projectIds !== null && scope.projectIds.includes(purchase.projectId))
    if (!inScope) throw new ApiError(404, 'NOT_FOUND', 'خرید یافت نشد.')

    if (purchase.status !== 'ORDERED' && purchase.status !== 'RECEIVED') {
      throw new ApiError(423, 'PURCHASE_NOT_PAYABLE', 'فقط خریدِ ثبت‌شده یا دریافت‌شده قابل پرداخت است.')
    }
    if (purchase.totalAmount == null) {
      throw new ApiError(422, 'NO_TOTAL_AMOUNT', 'ابتدا مبلغ کل خرید را در مرحلهٔ ثبت خرید وارد کنید.')
    }

    const info = computePaymentInfo(purchase)
    const remaining = BigInt(info.remainingAmount ?? '0')
    if (remaining <= 0n) {
      throw new ApiError(422, 'ALREADY_SETTLED', 'این خرید قبلاً به‌طور کامل تسویه شده است.')
    }
    const payAmount = BigInt(Math.round(amount))
    if (payAmount > remaining) {
      throw new ApiError(422, 'AMOUNT_EXCEEDS_DEBT', `مبلغ پرداخت بیش از بدهی باقی‌مانده است (حداکثر ${remaining.toLocaleString('fa-IR')} تومان).`)
    }

    const created = await db.payment.create({
      data: {
        purchaseId: purchase.id,
        amount: payAmount,
        paidAt: tehranDayStart(paidAt),
        method,
        referenceNo: referenceNo ?? null,
        note: note ?? null,
        createdById: user.id,
      },
    })

    await writeAudit({
      user,
      action: 'CREATE_PAYMENT',
      entityType: 'Payment',
      entityId: created.id,
      newValue: {
        purchaseNumber: purchase.number,
        amount: payAmount.toString(),
        method,
        remainingAfter: (remaining - payAmount).toString(),
      },
      ip,
      userAgent,
    })

    // اعلان به مدیر کل و حسابدارها — ثبت پرداخت
    const watchers = await db.user.findMany({
      where: { isActive: true, role: { in: ['GENERAL_MANAGER', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    })
    await notifyUsers({
      userIds: watchers.filter((w) => w.id !== user.id).map((w) => w.id),
      type: 'PAYMENT_REGISTERED',
      title: 'پرداخت ثبت شد',
      body: `پرداخت ${payAmount.toLocaleString('fa-IR')} تومانی برای خرید شمارهٔ ${purchase.number.toLocaleString('fa-IR')} توسط «${user.fullName}» ثبت شد.`,
      entityId: created.id,
      entityType: 'Payment',
    })

    const newInfo = computePaymentInfo({ ...purchase, payments: [...purchase.payments, { amount: payAmount }] })

    return ok(
      {
        paymentId: created.id,
        paidAmount: newInfo.paidAmount,
        remainingAmount: newInfo.remainingAmount,
        paymentStatus: newInfo.paymentStatus,
      },
      { status: 201 }
    )
  },
  { permission: 'finance.manage', schema: createPaymentSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'finance-write' } }
)

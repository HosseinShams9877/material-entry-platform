import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { tehranDayStart } from '@/lib/daily'
import { orderPurchaseSchema, type OrderPurchaseInput } from '@/lib/validate'

// ─────────────────────────── POST /api/v1/purchase-requests/[id]/order — ثبت خریداری‌شدن ───────────────────────────
// مرحلهٔ کارپردازی/خرید: تأمین‌کننده + تاریخ تحویل + مبلغ اختیاری + سررسید/شرایط پرداخت (مالی سادهٔ سند)
// تصویر فاکتور مسیر جداگانهٔ خودش را دارد: POST /purchase-requests/[id]/invoice

export const POST = apiHandler<OrderPurchaseInput>(
  async ({ params, user, body, ip, userAgent }) => {
    const request = await db.purchaseRequest.findUnique({ where: { id: params.id } })
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const scope = await getUserScope(user)
    const canAct =
      scope.isGlobal ||
      scope.workshopIds.includes(request.workshopId) ||
      (request.projectId && scope.projectIds !== null && scope.projectIds.includes(request.projectId))
    if (!canAct) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')
    if (request.status !== 'APPROVED') {
      throw new ApiError(423, 'PURCHASE_NOT_ORDERABLE', 'فقط درخواست تأییدشده قابل خریداری است.')
    }

    // اعتبارسنجی تأمین‌کننده — در صورت ارسال شناسه
    let supplierName: string | null = body.supplierName ?? null
    if (body.supplierId) {
      const supplier = await db.supplier.findUnique({ where: { id: body.supplierId } })
      if (!supplier || !supplier.isActive) {
        throw new ApiError(422, 'INVALID_SUPPLIER', 'تأمین‌کنندهٔ انتخاب‌شده معتبر نیست.')
      }
      if (!scope.isGlobal && supplier.workshopId && supplier.workshopId !== request.workshopId) {
        throw new ApiError(422, 'INVALID_SUPPLIER', 'تأمین‌کنندهٔ انتخاب‌شده به این کارگاه تعلق ندارد.')
      }
      supplierName = supplier.name
    }

    const now = new Date()
    await db.purchaseRequest.update({
      where: { id: request.id },
      data: {
        status: 'ORDERED',
        orderedById: user.id,
        orderedAt: now,
        supplierId: body.supplierId ?? null,
        supplierName,
        expectedDeliveryAt: body.expectedDeliveryAt ? tehranDayStart(body.expectedDeliveryAt) : null,
        totalAmount: body.totalAmount != null ? BigInt(Math.round(body.totalAmount)) : null,
        orderNote: body.orderNote ?? null,
        dueDate: body.dueDate != null ? tehranDayStart(body.dueDate) : null,
        paymentTerms: body.paymentTerms ?? null,
      },
    })

    await writeAudit({
      user,
      action: 'ORDER_PURCHASE',
      entityType: 'PurchaseRequest',
      entityId: request.id,
      oldValue: { status: 'APPROVED' },
      newValue: {
        status: 'ORDERED',
        supplierName,
        expectedDeliveryAt: body.expectedDeliveryAt ?? null,
        totalAmount: body.totalAmount != null ? String(body.totalAmount) : null,
        dueDate: body.dueDate ?? null,
      },
      ip,
      userAgent,
    })

    // اعلان به انباردارها برای آماده‌باش دریافت
    const warehouses = await db.user.findMany({
      where: {
        isActive: true,
        role: 'WAREHOUSE_MANAGER',
        OR: [{ workshopId: request.workshopId }, { userWorkshops: { some: { workshopId: request.workshopId } } }],
      },
      select: { id: true },
    })
    await notifyUsers({
      userIds: Array.from(new Set([request.requestedById, ...warehouses.map((w) => w.id)])),
      type: 'PURCHASE_ORDERED',
      title: 'مصالح خریداری شد',
      body: `درخواست خرید شمارهٔ ${request.number.toLocaleString('fa-IR')} توسط «${user.fullName}» خریداری شد${supplierName ? ` از «${supplierName}»` : ''} — منتظر دریافت در انبار.`,
      entityId: request.id,
      entityType: 'PurchaseRequest',
    })

    return ok({ status: 'ORDERED' })
  },
  { permission: 'purchase.order', schema: orderPurchaseSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' } }
)

import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { getUserScope, workshopOrProjectScopeFilter } from '@/lib/scope'
import { computePaymentInfo } from '@/lib/finance'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/finance/summary — خلاصهٔ مالی (بدهی/پرداخت/طلب) ───────────────────────────
// طبق سند سیستم یکپارچه — داشبورد مدیریتی: «هزینهٔ کل، بدهی، طلب و وضعیت مالی هر پروژه»
// + هشدار سررسید: «اعلان سررسید پرداخت به مسئول مربوطه».

export const GET = apiHandler(
  async ({ user }) => {
    const scope = await getUserScope(user)
    const purchaseScope = workshopOrProjectScopeFilter(scope) as Prisma.PurchaseRequestWhereInput
    const receivableScope = workshopOrProjectScopeFilter(scope) as Prisma.ReceivableWhereInput

    // خریدهای ثبت‌شده (ORDERED/RECEIVED) که مبلغ کل دارند — مبنای بدهی
    const purchaseWhere: Prisma.PurchaseRequestWhereInput = {
      AND: [
        purchaseScope,
        { status: { in: ['ORDERED', 'RECEIVED'] } },
        { totalAmount: { not: null } },
      ],
    }

    const [purchases, receivables, recentPayments] = await Promise.all([
      db.purchaseRequest.findMany({
        where: purchaseWhere,
        include: {
          payments: { orderBy: { paidAt: 'asc' } },
          workshop: { select: { name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { orderedAt: 'desc' }],
      }),
      db.receivable.findMany({
        where: receivableScope,
        include: { workshop: { select: { name: true } }, project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.payment.findMany({
        where: { purchase: purchaseScope },
        include: {
          createdBy: { select: { fullName: true } },
          purchase: {
            select: { id: true, number: true, supplierName: true, workshop: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ])

    let purchasesTotal = 0n
    let paidTotal = 0n
    let debtTotal = 0n
    let overdueCount = 0
    let overdueTotal = 0n

    const byProjectMap = new Map<string, { projectId: string | null; name: string; purchasesTotal: bigint; paid: bigint; debt: bigint; overdueCount: number }>()
    const overdueList: Array<Record<string, unknown>> = []
    const debts: Array<Record<string, unknown>> = []

    for (const p of purchases) {
      const info = computePaymentInfo(p)
      const total = p.totalAmount ?? 0n
      const paid = BigInt(info.paidAmount)
      const remaining = BigInt(info.remainingAmount ?? '0')
      purchasesTotal += total
      paidTotal += paid
      debtTotal += remaining
      if (info.isOverdue) {
        overdueCount += 1
        overdueTotal += remaining
        if (overdueList.length < 10) {
          overdueList.push({
            id: p.id,
            number: p.number,
            supplierName: p.supplierName,
            workshopName: p.workshop.name,
            projectName: p.project?.name ?? null,
            totalAmount: total.toString(),
            paidAmount: paid.toString(),
            remainingAmount: remaining.toString(),
            dueDate: p.dueDate?.toISOString() ?? null,
          })
        }
      }
      // فهرست بدهی‌ها — همهٔ خریدهای دارای مانده (حتی بدون سررسید)
      if (remaining > 0n && debts.length < 100) {
        debts.push({
          id: p.id,
          number: p.number,
          status: p.status,
          supplierName: p.supplierName,
          workshopId: p.workshopId,
          workshopName: p.workshop.name,
          projectId: p.projectId,
          projectName: p.project?.name ?? null,
          totalAmount: total.toString(),
          paidAmount: paid.toString(),
          remainingAmount: remaining.toString(),
          dueDate: p.dueDate?.toISOString() ?? null,
          paymentTerms: p.paymentTerms,
          isOverdue: info.isOverdue,
          paymentsCount: info.paymentsCount,
        })
      }
      const key = p.projectId ?? '__none__'
      const rec = byProjectMap.get(key) ?? {
        projectId: p.projectId,
        name: p.project?.name ?? 'بدون پروژه',
        purchasesTotal: 0n,
        paid: 0n,
        debt: 0n,
        overdueCount: 0,
      }
      rec.purchasesTotal += total
      rec.paid += paid
      rec.debt += remaining
      if (info.isOverdue) rec.overdueCount += 1
      byProjectMap.set(key, rec)
    }

    const openReceivables = receivables.filter((r) => r.status === 'OPEN')
    const receivablesOpenAmount = openReceivables.reduce((a, r) => a + r.amount, 0n)
    const now = Date.now()
    const receivablesOverdue = openReceivables.filter(
      (r) => r.dueDate && r.dueDate.getTime() < now
    ).length

    return ok({
      totals: {
        purchasesCount: purchases.length,
        purchasesTotal: purchasesTotal.toString(),
        paidTotal: paidTotal.toString(),
        debtTotal: debtTotal.toString(),
        overdueCount,
        overdueTotal: overdueTotal.toString(),
        receivablesOpenCount: openReceivables.length,
        receivablesOpenAmount: receivablesOpenAmount.toString(),
        receivablesOverdue,
      },
      byProject: Array.from(byProjectMap.values()).map((r) => ({
        projectId: r.projectId,
        name: r.name,
        purchasesTotal: r.purchasesTotal.toString(),
        paid: r.paid.toString(),
        debt: r.debt.toString(),
        overdueCount: r.overdueCount,
      })),
      debts,
      overdue: overdueList,
      recentPayments: recentPayments.map((pay) => ({
        id: pay.id,
        amount: pay.amount.toString(),
        paidAt: pay.paidAt.toISOString(),
        method: pay.method,
        createdByName: pay.createdBy.fullName,
        purchaseId: pay.purchase.id,
        purchaseNumber: pay.purchase.number,
        supplierName: pay.purchase.supplierName,
        workshopName: pay.purchase.workshop.name,
      })),
    })
  },
  { permission: 'finance.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'finance' } }
)

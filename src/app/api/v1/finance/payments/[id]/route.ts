import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ─────────────────────────── DELETE /api/v1/finance/payments/[id] — حذف پرداخت (اصلاح اشتباه) ───────────────────────────

export async function DELETE(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ user, params, ip, userAgent }) => {
      const { id } = params
      const payment = await db.payment.findUnique({
        where: { id },
        include: { purchase: { select: { id: true, number: true, workshopId: true, projectId: true } } },
      })
      if (!payment) throw new ApiError(404, 'NOT_FOUND', 'پرداخت یافت نشد.')

      const scope = await getUserScope(user)
      const inScope =
        scope.isGlobal ||
        scope.workshopIds.includes(payment.purchase.workshopId) ||
        (payment.purchase.projectId && scope.projectIds !== null && scope.projectIds.includes(payment.purchase.projectId))
      if (!inScope) throw new ApiError(404, 'NOT_FOUND', 'پرداخت یافت نشد.')

      await db.payment.delete({ where: { id } })

      await writeAudit({
        user,
        action: 'DELETE_PAYMENT',
        entityType: 'Payment',
        entityId: id,
        oldValue: {
          purchaseNumber: payment.purchase.number,
          amount: payment.amount.toString(),
          method: payment.method,
        },
        ip,
        userAgent,
      })

      return ok({ deleted: true })
    },
    { permission: 'finance.manage', rateLimit: { limit: 30, windowMs: 60_000, scope: 'finance-write' } }
  )(req, ctx)
}

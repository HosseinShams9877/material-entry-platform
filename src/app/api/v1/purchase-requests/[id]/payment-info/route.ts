import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { purchasePaymentInfoSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { tehranDayStart } from '@/lib/daily'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ─────────────────────────── PATCH /api/v1/purchase-requests/[id]/payment-info — سررسید و شرایط پرداخت ───────────────────────────
// طبق سند سیستم یکپارچه: «ثبت شرایط پرداخت، تاریخ سررسید و پیگیری بدهی» — قابل ویرایش پس از ثبت خرید.

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const purchase = await db.purchaseRequest.findUnique({ where: { id } })
      if (!purchase) throw new ApiError(404, 'NOT_FOUND', 'خرید یافت نشد.')

      const scope = await getUserScope(user)
      const inScope =
        scope.isGlobal ||
        scope.workshopIds.includes(purchase.workshopId) ||
        (purchase.projectId && scope.projectIds !== null && scope.projectIds.includes(purchase.projectId))
      if (!inScope) throw new ApiError(404, 'NOT_FOUND', 'خرید یافت نشد.')

      if (purchase.status !== 'ORDERED' && purchase.status !== 'RECEIVED') {
        throw new ApiError(423, 'PURCHASE_NOT_ORDERED', 'سررسید و شرایط پرداخت پس از ثبت خرید قابل ویرایش است.')
      }

      const updated = await db.purchaseRequest.update({
        where: { id },
        data: {
          dueDate: body.dueDate !== undefined ? (body.dueDate ? tehranDayStart(body.dueDate) : null) : undefined,
          paymentTerms: body.paymentTerms !== undefined ? body.paymentTerms : undefined,
        },
      })

      await writeAudit({
        user,
        action: 'EDIT_PAYMENT_INFO',
        entityType: 'PurchaseRequest',
        entityId: id,
        oldValue: { dueDate: purchase.dueDate?.toISOString() ?? null, paymentTerms: purchase.paymentTerms },
        newValue: { dueDate: updated.dueDate?.toISOString() ?? null, paymentTerms: updated.paymentTerms },
        ip,
        userAgent,
      })

      return ok({ dueDate: updated.dueDate?.toISOString() ?? null, paymentTerms: updated.paymentTerms })
    },
    { permission: 'finance.manage', schema: purchasePaymentInfoSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'finance-write' } }
  )(req, ctx)
}

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { rejectPurchaseSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { hasPermission } from '@/lib/permissions'

// ─────────────────────────── POST /api/v1/purchase-requests/[id]/reject — رد نیاز ───────────────────────────

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const request = await db.purchaseRequest.findUnique({ where: { id: params.id } })
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const scope = await getUserScope(user)
    const canAct =
      scope.isGlobal ||
      scope.workshopIds.includes(request.workshopId) ||
      (request.projectId && scope.projectIds !== null && scope.projectIds.includes(request.projectId))
    if (!canAct) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')
    if (!hasPermission(user.role, 'purchase.approve')) {
      throw new ApiError(403, 'FORBIDDEN', 'شما اجازهٔ رد درخواست خرید را ندارید.')
    }
    if (request.status !== 'PENDING') {
      throw new ApiError(423, 'PURCHASE_NOT_REJECTABLE', 'این درخواست در مرحلهٔ تأیید نیست.')
    }

    const now = new Date()
    await db.purchaseRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', rejectedById: user.id, rejectedAt: now, rejectReason: body.reason },
    })

    await writeAudit({
      user,
      action: 'REJECT_PURCHASE_REQUEST',
      entityType: 'PurchaseRequest',
      entityId: request.id,
      oldValue: { status: 'PENDING' },
      newValue: { status: 'REJECTED', reason: body.reason },
      ip,
      userAgent,
    })

    await notifyUsers({
      userIds: [request.requestedById],
      type: 'PURCHASE_DECIDED',
      title: 'درخواست خرید رد شد',
      body: `درخواست خرید شمارهٔ ${request.number.toLocaleString('fa-IR')} توسط «${user.fullName}» رد شد. علت: ${body.reason}`,
      entityId: request.id,
      entityType: 'PurchaseRequest',
    })

    return ok({ status: 'REJECTED' })
  },
  {
    permission: 'purchase.view',
    schema: rejectPurchaseSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' },
  }
)

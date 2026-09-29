import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/purchase-requests/[id]/approve — تأیید نیاز ───────────────────────────

export const POST = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const request = await db.purchaseRequest.findUnique({
      where: { id: params.id },
      include: { workshop: { select: { name: true } } },
    })
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const scope = await getUserScope(user)
    const canAct =
      scope.isGlobal ||
      scope.workshopIds.includes(request.workshopId) ||
      (request.projectId && scope.projectIds !== null && scope.projectIds.includes(request.projectId))
    if (!canAct) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')
    if (request.status !== 'PENDING') {
      throw new ApiError(423, 'PURCHASE_NOT_APPROVABLE', 'این درخواست در مرحلهٔ تأیید نیست.')
    }

    const now = new Date()
    await db.purchaseRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', approvedById: user.id, approvedAt: now },
    })

    await writeAudit({
      user,
      action: 'APPROVE_PURCHASE_REQUEST',
      entityType: 'PurchaseRequest',
      entityId: request.id,
      oldValue: { status: 'PENDING' },
      newValue: { status: 'APPROVED' },
      ip,
      userAgent,
    })

    await notifyUsers({
      userIds: [request.requestedById],
      type: 'PURCHASE_DECIDED',
      title: 'درخواست خرید تأیید شد',
      body: `درخواست خرید شمارهٔ ${request.number.toLocaleString('fa-IR')} توسط «${user.fullName}» تأیید شد و آمادهٔ خریداری است.`,
      entityId: request.id,
      entityType: 'PurchaseRequest',
    })

    return ok({ status: 'APPROVED' })
  },
  { permission: 'purchase.approve', rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' } }
)

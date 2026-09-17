import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { rejectStatementSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { hasPermission } from '@/lib/permissions'

// ─────────────────────────── POST /api/v1/statements/[id]/reject — رد صورت وضعیت ───────────────────────────
// مدیر (روی SUBMITTED) یا مدیر کل (روی PENDING_GM_SIGN) می‌تواند رد کند.

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const statement = await db.progressStatement.findUnique({ where: { id: params.id } })
    if (!statement) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')

    const scope = await getUserScope(user)
    const canAct =
      scope.isGlobal ||
      scope.workshopIds.includes(statement.workshopId) ||
      (statement.projectId && scope.projectIds !== null && scope.projectIds.includes(statement.projectId))
    if (!canAct) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')

    const isManagerReject = statement.status === 'SUBMITTED' && hasPermission(user.role, 'statement.approve')
    const isGmReject = statement.status === 'PENDING_GM_SIGN' && user.role === 'GENERAL_MANAGER'
    if (!isManagerReject && !isGmReject) {
      throw new ApiError(423, 'STATEMENT_NOT_REJECTABLE', 'این صورت وضعیت در مرحلهٔ قابل رد نیست.')
    }

    const now = new Date()
    await db.progressStatement.update({
      where: { id: statement.id },
      data: {
        status: 'REJECTED',
        rejectedById: user.id,
        rejectedAt: now,
        rejectReason: body.reason,
      },
    })

    await writeAudit({
      user,
      action: 'REJECT_STATEMENT',
      entityType: 'ProgressStatement',
      entityId: statement.id,
      oldValue: { status: statement.status },
      newValue: { status: 'REJECTED', reason: body.reason },
      ip,
      userAgent,
    })

    await notifyUsers({
      userIds: [statement.createdById],
      type: 'STATEMENT_DECIDED',
      title: 'صورت وضعیت رد شد',
      body: `صورت وضعیت شمارهٔ ${statement.number.toLocaleString('fa-IR')} توسط «${user.fullName}» رد شد. علت: ${body.reason}`,
      entityId: statement.id,
      entityType: 'ProgressStatement',
    })

    return ok({ status: 'REJECTED' })
  },
  {
    permission: 'statement.view',
    schema: rejectStatementSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'statements-write' },
  }
)

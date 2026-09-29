import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { cancelTaskSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/cancel — لغو وظیفه ───────────────────────────

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const existing = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true, workshopId: true, createdById: true },
    })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    const scope = await getUserScope(user)
    const allowed = scope.isGlobal || existing.createdById === user.id || scope.workshopIds.includes(existing.workshopId)
    if (!allowed) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new ApiError(423, 'TASK_NOT_CANCELLABLE', 'وظیفهٔ انجام‌شده یا لغوشده قابل لغو مجدد نیست.')
    }

    await db.dailyTask.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED', cancelReason: body.reason },
    })

    await writeAudit({
      user,
      action: 'CANCEL_DAILY_TASK',
      entityType: 'DailyTask',
      entityId: existing.id,
      oldValue: { status: existing.status },
      newValue: { status: 'CANCELLED' },
      reason: body.reason,
      ip,
      userAgent,
    })

    const assignees = await db.taskAssignee.findMany({ where: { taskId: existing.id }, select: { userId: true } })
    await notifyUsers({
      userIds: assignees.map((a) => a.userId),
      type: 'TASK_CANCELLED',
      title: 'وظیفه لغو شد',
      body: `وظیفهٔ «${existing.title}» لغو شد: ${body.reason}`,
      entityId: existing.id,
      entityType: 'DailyTask',
    })

    return ok({ cancelled: true })
  },
  {
    permission: 'task.cancel',
    schema: cancelTaskSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)

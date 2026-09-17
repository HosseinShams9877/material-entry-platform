import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { isTaskAssignee, progressPercent } from '@/lib/daily'

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/items/[itemId]/uncomplete ───────────────────────────
// برداشتن تیک آیتم — با ثبت Audit Log. اگر وظیفه COMPLETED بوده → به IN_PROGRESS برمی‌گردد.

export const POST = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      const assignee = await isTaskAssignee(user.id, task.id)
      if (!assignee) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')
    }

    if (task.status === 'CANCELLED' || task.status === 'DRAFT') {
      throw new ApiError(423, 'TASK_NOT_ACTIVE', 'این وظیفه در وضعیت قابل تغییر نیست.')
    }

    const item = await db.dailyTaskItem.findUnique({ where: { id: params.itemId } })
    if (!item || item.taskId !== task.id) throw new ApiError(404, 'NOT_FOUND', 'آیتم وظیفه یافت نشد.')
    if (!item.isCompleted) throw new ApiError(409, 'NOT_COMPLETED', 'این آیتم انجام‌نشده است.')

    const updatedItem = await db.dailyTaskItem.update({
      where: { id: item.id },
      data: { isCompleted: false, completedAt: null, completedById: null, completionNote: null },
    })

    // اگر وظیفه کامل شده بود و تیک برداشته شد → به «در حال انجام» برگردد
    const taskStatus = task.status === 'COMPLETED' ? 'IN_PROGRESS' : task.status
    await db.dailyTask.update({
      where: { id: task.id },
      data: {
        status: taskStatus,
        ...(task.status === 'COMPLETED' ? { completedAt: null, completedById: null, completionNote: null } : {}),
      },
    })

    await writeAudit({
      user,
      action: 'UNCOMPLETE_TASK_ITEM',
      entityType: 'DailyTaskItem',
      entityId: item.id,
      oldValue: { isCompleted: true, completedAt: item.completedAt?.toISOString() ?? null, note: item.completionNote },
      newValue: { isCompleted: false },
      ip,
      userAgent,
    })

    const items = await db.dailyTaskItem.findMany({ where: { taskId: task.id }, select: { isCompleted: true } })

    return ok({
      item: {
        id: updatedItem.id,
        isCompleted: false,
        completedAt: null,
        completedByName: null,
        completionNote: null,
      },
      taskStatus,
      progress: progressPercent(items),
    })
  },
  { permission: 'task.complete', rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-tasks-write' } }
)

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { isTaskAssignee, recomputeItemSharedFlag, assigneeProgressPercent, averageAssigneeProgress } from '@/lib/daily'

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/items/[itemId]/uncomplete ───────────────────────────
// برداشتن تیک آیتم — Item ۸: فقط انجامِ «خودِ کاربر» پس گرفته می‌شود.
// اگر وظیفه COMPLETED بوده → به IN_PROGRESS برمی‌گردد.

export const POST = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    if (user.role !== 'PROJECT_MANAGER') {
      const assignee = await isTaskAssignee(user.id, task.id)
      if (!assignee) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')
    }

    if (task.status === 'CANCELLED' || task.status === 'DRAFT') {
      throw new ApiError(423, 'TASK_NOT_ACTIVE', 'این وظیفه در وضعیت قابل تغییر نیست.')
    }

    const item = await db.dailyTaskItem.findUnique({ where: { id: params.itemId } })
    if (!item || item.taskId !== task.id) throw new ApiError(404, 'NOT_FOUND', 'آیتم وظیفه یافت نشد.')

    // Item ۸: فقط انجامِ این کاربر پس گرفته می‌شود — انجامِ همکاران دست‌نخورده می‌ماند
    const mine = await db.taskItemCompletion.findUnique({
      where: { itemId_userId: { itemId: item.id, userId: user.id } },
      select: { id: true, isCompleted: true },
    })
    if (!mine?.isCompleted) throw new ApiError(409, 'NOT_COMPLETED', 'شما این آیتم را انجام‌شده ثبت نکرده‌اید.')

    await db.taskItemCompletion.update({
      where: { id: mine.id },
      data: { isCompleted: false, completedAt: null, completionNote: null },
    })

    // پرچم اشتراکی آیتم دوباره محاسبه می‌شود (دیگر همه تیک نزده‌اند)
    const assigneeCount = await db.taskAssignee.count({ where: { taskId: task.id } })
    const sharedCompleted = await recomputeItemSharedFlag(item.id, assigneeCount)

    // اگر وظیفه کامل شده بود و این کاربر تیک برداشت → به «در حال انجام» برگردد
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
      oldValue: { isCompleted: true, perRecipient: true },
      newValue: { isCompleted: false, uncompletedBy: user.id },
      ip,
      userAgent,
    })

    const items = await db.dailyTaskItem.findMany({
      where: { taskId: task.id },
      select: { id: true, isCompleted: true, completions: { select: { userId: true, isCompleted: true } } },
    })
    const assignees = await db.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } })

    return ok({
      item: {
        id: item.id,
        isCompleted: sharedCompleted,
        completedAt: null,
        completedByName: null,
        completionNote: null,
      },
      taskStatus,
      progress: assigneeProgressPercent(items, user.id),
      averageProgress: averageAssigneeProgress(items, assignees.map((a) => a.userId)),
    })
  },
  { permission: 'task.complete', rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-tasks-write' } }
)

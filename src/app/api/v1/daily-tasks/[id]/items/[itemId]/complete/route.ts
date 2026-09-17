import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { completeItemSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { isTaskAssignee, completeTaskWhenAllItemsDone, progressPercent } from '@/lib/daily'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/items/[itemId]/complete ───────────────────────────
// تیک‌زدن یک آیتم توسط سرپرست گیرندهٔ وظیفه — زمان انجام دقیق ثبت می‌شود.

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true, projectId: true, createdById: true, items: { select: { id: true, isCompleted: true } } },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    // فقط گیرندهٔ وظیفه (یا ادمین سراسری) حق تیک‌زدن دارد — دسترسی عرضی مسدود است
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      const assignee = await isTaskAssignee(user.id, task.id)
      if (!assignee) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')
    }

    if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
      throw new ApiError(423, 'TASK_NOT_ACTIVE', 'این وظیفه در وضعیت قابل انجام نیست.')
    }

    const item = await db.dailyTaskItem.findUnique({ where: { id: params.itemId } })
    if (!item || item.taskId !== task.id) throw new ApiError(404, 'NOT_FOUND', 'آیتم وظیفه یافت نشد.')
    if (item.isCompleted) throw new ApiError(409, 'ALREADY_COMPLETED', 'این آیتم قبلاً انجام شده است.')

    const now = new Date()
    const updatedItem = await db.dailyTaskItem.update({
      where: { id: item.id },
      data: { isCompleted: true, completedAt: now, completedById: user.id, completionNote: body.note ?? null },
    })

    // اگر وظیفه در انتظار بود → در حال انجام
    await db.dailyTask.update({
      where: { id: task.id },
      data: { status: task.status === 'PENDING' ? 'IN_PROGRESS' : task.status },
    })

    await writeAudit({
      user,
      action: 'COMPLETE_TASK_ITEM',
      entityType: 'DailyTaskItem',
      entityId: item.id,
      oldValue: { isCompleted: false, taskId: task.id },
      newValue: { isCompleted: true, completedAt: now.toISOString(), note: body.note ?? null },
      ip,
      userAgent,
    })

    // اعلان تکمیل آیتم به ایجادکنندهٔ وظیفه
    await notifyUsers({
      userIds: [task.createdById],
      type: 'TASK_ITEM_COMPLETED',
      title: 'انجام یک آیتم ثبت شد',
      body: `«${item.title}» از وظیفهٔ «${task.title}» انجام شد.`,
      entityId: task.id,
      entityType: 'DailyTask',
    })

    // تکمیل خودکار وظیفه وقتی همهٔ آیتم‌ها تیک خوردند
    const autoCompleted = await completeTaskWhenAllItemsDone(task.id, user.id, body.note ?? null)

    const items = await db.dailyTaskItem.findMany({ where: { taskId: task.id }, select: { isCompleted: true } })

    return ok({
      item: {
        id: updatedItem.id,
        isCompleted: true,
        completedAt: updatedItem.completedAt?.toISOString() ?? null,
        completedByName: user.fullName,
        completionNote: updatedItem.completionNote,
      },
      taskStatus: autoCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      progress: progressPercent(items),
    })
  },
  {
    permission: 'task.complete',
    schema: completeItemSchema,
    rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)

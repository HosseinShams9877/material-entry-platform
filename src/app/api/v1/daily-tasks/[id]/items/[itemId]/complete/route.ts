import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { completeItemSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import {
  isTaskAssignee,
  completeTaskWhenAllItemsDone,
  recomputeItemSharedFlag,
  assigneeProgressPercent,
  averageAssigneeProgress,
} from '@/lib/daily'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/items/[itemId]/complete ───────────────────────────
// تیک‌زدن یک آیتم توسط گیرندهٔ وظیفه — Item ۸: انجام مستقل برای «همان شخص» ثبت می‌شود.
// تیک دیگران روی انجامِ این کاربر اثر ندارد.

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true, projectId: true, createdById: true },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    // فقط گیرندهٔ وظیفه (یا ادمین سراسری) حق تیک‌زدن دارد — دسترسی عرضی مسدود است
    if (user.role !== 'PROJECT_MANAGER') {
      const assignee = await isTaskAssignee(user.id, task.id)
      if (!assignee) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')
    }

    if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
      throw new ApiError(423, 'TASK_NOT_ACTIVE', 'این وظیفه در وضعیت قابل انجام نیست.')
    }

    const item = await db.dailyTaskItem.findUnique({ where: { id: params.itemId } })
    if (!item || item.taskId !== task.id) throw new ApiError(404, 'NOT_FOUND', 'آیتم وظیفه یافت نشد.')

    // Item ۸: فقط انجامِ خودِ این کاربر بررسی می‌شود — تکمیل توسط همکاران مانعِ دوباره‌زدن نیست
    const mine = await db.taskItemCompletion.findUnique({
      where: { itemId_userId: { itemId: item.id, userId: user.id } },
      select: { id: true, isCompleted: true },
    })
    if (mine?.isCompleted) throw new ApiError(409, 'ALREADY_COMPLETED', 'شما این آیتم را قبلاً انجام‌شده ثبت کرده‌اید.')

    const now = new Date()
    const note = body.note ?? null

    // Item ۸: انجام مستقلِ این گیرنده (upsert روی کلید itemId+userId)
    await db.taskItemCompletion.upsert({
      where: { itemId_userId: { itemId: item.id, userId: user.id } },
      create: { itemId: item.id, userId: user.id, isCompleted: true, completedAt: now, completionNote: note },
      update: { isCompleted: true, completedAt: now, completionNote: note },
    })

    // پرچم اشتراکی آیتم فقط وقتی «true» می‌شود که همهٔ گیرنده‌ها تیک زده باشند
    const assigneeCount = await db.taskAssignee.count({ where: { taskId: task.id } })
    const sharedCompleted = await recomputeItemSharedFlag(item.id, assigneeCount, user.id)

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
      oldValue: { isCompleted: item.isCompleted, taskId: task.id, perRecipient: true },
      newValue: { isCompleted: true, completedAt: now.toISOString(), note, completedBy: user.id },
      ip,
      userAgent,
    })

    // اعلان تکمیل آیتم به ایجادکنندهٔ وظیفه
    await notifyUsers({
      userIds: [task.createdById],
      type: 'TASK_ITEM_COMPLETED',
      title: 'انجام یک آیتم ثبت شد',
      body: `«${item.title}» از وظیفهٔ «${task.title}» توسط ${user.fullName} انجام شد.`,
      entityId: task.id,
      entityType: 'DailyTask',
    })

    // Item ۸: وظیفه تنها وقتی پایان می‌یابد که همهٔ گیرنده‌ها همهٔ آیتم‌ها را انجام دهند
    const autoCompleted = await completeTaskWhenAllItemsDone(task.id, user.id, note)

    const items = await db.dailyTaskItem.findMany({
      where: { taskId: task.id },
      select: { id: true, isCompleted: true, completions: { select: { userId: true, isCompleted: true } } },
    })
    const assignees = await db.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } })

    return ok({
      item: {
        id: item.id,
        isCompleted: sharedCompleted,
        completedAt: now.toISOString(),
        completedByName: user.fullName,
        completionNote: note,
      },
      taskStatus: autoCompleted ? 'COMPLETED' : task.status === 'PENDING' ? 'IN_PROGRESS' : task.status,
      progress: assigneeProgressPercent(items, user.id),
      averageProgress: averageAssigneeProgress(items, assignees.map((a) => a.userId)),
    })
  },
  {
    permission: 'task.complete',
    schema: completeItemSchema,
    rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)

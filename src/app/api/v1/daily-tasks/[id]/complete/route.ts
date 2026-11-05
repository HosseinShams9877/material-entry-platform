import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { completeTaskSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import {
  isTaskAssignee,
  projectManagerIds,
  recomputeItemSharedFlag,
  completeTaskWhenAllItemsDone,
  assigneeProgressPercent,
  averageAssigneeProgress,
} from '@/lib/daily'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/complete — تکمیل کل وظیفه ───────────────────────────
// Item ۸: «تکمیل همه» تنها برای «همان گیرنده» همهٔ آیتم‌ها را تیک می‌زند؛ وظیفه زمانی
// تمام می‌شود که هر گیرنده همهٔ آیتم‌ها را انجام داده باشد. وظایف بدون آیتم مستقیماً COMPLETED می‌شوند.

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true, projectId: true, createdById: true, items: { select: { id: true, isCompleted: true } } },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    if (user.role !== 'PROJECT_MANAGER') {
      const assignee = await isTaskAssignee(user.id, task.id)
      if (!assignee) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')
    }

    if (task.status === 'DRAFT') {
      throw new ApiError(422, 'TASK_NOT_SENT', 'وظیفهٔ ارسال‌نشده قابل تکمیل نیست.')
    }
    if (task.status === 'COMPLETED') throw new ApiError(409, 'ALREADY_COMPLETED', 'این وظیفه قبلاً تکمیل شده است.')
    if (task.status === 'CANCELLED') throw new ApiError(423, 'TASK_CANCELLED', 'وظیفهٔ لغوشده قابل تکمیل نیست.')

    const now = new Date()
    const note = body.note ?? null
    const assigneeCount = await db.taskAssignee.count({ where: { taskId: task.id } })

    if (task.items.length === 0) {
      // وظیفه بدون آیتم — مستقیماً COMPLETED
      await db.dailyTask.update({
        where: { id: task.id },
        data: { status: 'COMPLETED', completedAt: now, completedById: user.id, completionNote: note },
      })
    } else {
      // Item ۸: همهٔ آیتم‌ها برای این گیرنده تیک می‌خورند (انجام همکاران دست‌نخورده می‌ماند)
      await db.$transaction(async (tx) => {
        for (const it of task.items) {
          await tx.taskItemCompletion.upsert({
            where: { itemId_userId: { itemId: it.id, userId: user.id } },
            create: { itemId: it.id, userId: user.id, isCompleted: true, completedAt: now, completionNote: note },
            update: { isCompleted: true, completedAt: now, completionNote: note },
          })
        }
        if (task.status === 'PENDING') {
          await tx.dailyTask.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } })
        }
      })
      for (const it of task.items) {
        await recomputeItemSharedFlag(it.id, assigneeCount, user.id)
      }
      // تلاش برای پایان دادن به وظیفه — فقط اگر هر گیرنده همه را انجام داده باشد
      await completeTaskWhenAllItemsDone(task.id, user.id, note)
    }

    await writeAudit({
      user,
      action: 'COMPLETE_DAILY_TASK',
      entityType: 'DailyTask',
      entityId: task.id,
      oldValue: { status: task.status },
      newValue: { status: 'COMPLETED', completedAt: now.toISOString(), note, perRecipient: true, completedBy: user.id },
      ip,
      userAgent,
    })

    await notifyUsers({
      userIds: [task.createdById],
      type: 'TASK_COMPLETED',
      title: 'وظیفه تکمیل شد',
      body: `وظیفهٔ «${task.title}» توسط ${user.fullName} انجام شد.`,
      entityId: task.id,
      entityType: 'DailyTask',
    })
    const pmIds = await projectManagerIds(task.projectId)
    await notifyUsers({
      userIds: pmIds,
      type: 'TASK_COMPLETED',
      title: 'وظیفهٔ کارگاه تکمیل شد',
      body: `وظیفهٔ «${task.title}» توسط ${user.fullName} تکمیل شد.`,
      entityId: task.id,
      entityType: 'DailyTask',
    })

    const updated = await db.dailyTask.findUnique({
      where: { id: task.id },
      select: { status: true, items: { select: { id: true, isCompleted: true, completions: { select: { userId: true, isCompleted: true } } } } },
    })
    const assignees = await db.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } })

    return ok({
      completed: updated?.status === 'COMPLETED',
      completedAt: updated?.status === 'COMPLETED' ? now.toISOString() : null,
      taskStatus: updated?.status ?? task.status,
      progress: assigneeProgressPercent(updated?.items ?? [], user.id),
      averageProgress: averageAssigneeProgress(updated?.items ?? [], assignees.map((a) => a.userId)),
    })
  },
  {
    permission: 'task.complete',
    schema: completeTaskSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)

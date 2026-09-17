import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { completeTaskSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { isTaskAssignee, projectManagerIds } from '@/lib/daily'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/complete — تکمیل کل وظیفه ───────────────────────────
// برای وظایف دارای آیتم: همهٔ آیتم‌های باقی‌مانده تیک می‌خورند (زمان هر آیتم جدا ثبت می‌شود).
// برای وظایف بدون آیتم: وظیفه مستقیماً COMPLETED می‌شود.

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true, projectId: true, createdById: true, items: { select: { id: true, isCompleted: true } } },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      const assignee = await isTaskAssignee(user.id, task.id)
      if (!assignee) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')
    }

    if (task.status === 'DRAFT') {
      throw new ApiError(422, 'TASK_NOT_SENT', 'وظیفهٔ ارسال‌نشده قابل تکمیل نیست.')
    }
    if (task.status === 'COMPLETED') throw new ApiError(409, 'ALREADY_COMPLETED', 'این وظیفه قبلاً تکمیل شده است.')
    if (task.status === 'CANCELLED') throw new ApiError(423, 'TASK_CANCELLED', 'وظیفهٔ لغوشده قابل تکمیل نیست.')

    const now = new Date()
    await db.$transaction(async (tx) => {
      await tx.dailyTaskItem.updateMany({
        where: { taskId: task.id, isCompleted: false },
        data: { isCompleted: true, completedAt: now, completedById: user.id, completionNote: body.note ?? null },
      })
      await tx.dailyTask.update({
        where: { id: task.id },
        data: { status: 'COMPLETED', completedAt: now, completedById: user.id, completionNote: body.note ?? null },
      })
    })

    await writeAudit({
      user,
      action: 'COMPLETE_DAILY_TASK',
      entityType: 'DailyTask',
      entityId: task.id,
      oldValue: { status: task.status },
      newValue: { status: 'COMPLETED', completedAt: now.toISOString(), note: body.note ?? null },
      ip,
      userAgent,
    })

    await notifyUsers({
      userIds: [task.createdById],
      type: 'TASK_COMPLETED',
      title: 'وظیفه تکمیل شد',
      body: `وظیفهٔ «${task.title}» به‌طور کامل انجام شد.`,
      entityId: task.id,
      entityType: 'DailyTask',
    })
    const pmIds = await projectManagerIds(task.projectId)
    await notifyUsers({
      userIds: pmIds,
      type: 'TASK_COMPLETED',
      title: 'وظیفهٔ کارگاه تکمیل شد',
      body: `وظیفهٔ «${task.title}» توسط سرپرست تکمیل شد.`,
      entityId: task.id,
      entityType: 'DailyTask',
    })

    return ok({ completed: true, completedAt: now.toISOString() })
  },
  {
    permission: 'task.complete',
    schema: completeTaskSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)

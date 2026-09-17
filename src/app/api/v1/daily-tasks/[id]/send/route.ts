import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { sendTaskSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/send — ارسال وظیفه به سرپرستان ───────────────────────────

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const existing = await db.dailyTask.findUnique({
      where: { id: params.id },
      include: { assignees: { select: { userId: true } } },
    })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    const scope = await getUserScope(user)
    const allowed = scope.isGlobal || existing.createdById === user.id || scope.workshopIds.includes(existing.workshopId)
    if (!allowed) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    if (existing.status !== 'DRAFT' && existing.status !== 'PENDING') {
      throw new ApiError(423, 'TASK_NOT_SENDABLE', 'این وظیفه در وضعیت فعلی قابل ارسال نیست.')
    }

    // گیرنده‌ها: از بدنه یا گیرنده‌های ثبت‌شدهٔ پیش‌نویس
    const targetIds = body.assigneeIds ?? existing.assignees.map((a) => a.userId)
    if (targetIds.length === 0) {
      throw new ApiError(422, 'NO_ASSIGNEE', 'حداقل یک سرپرست باید انتخاب شود.')
    }

    // گیرنده باید سرپرست فعالِ همان کارگاه باشد — جعل شناسه رد می‌شود
    const validAssignees = await db.user.findMany({
      where: {
        id: { in: targetIds },
        isActive: true,
        role: 'WORKSHOP_SUPERVISOR',
        OR: [{ workshopId: existing.workshopId }, { userWorkshops: { some: { workshopId: existing.workshopId } } }],
      },
      select: { id: true, fullName: true },
    })
    if (validAssignees.length !== targetIds.length) {
      throw new ApiError(422, 'INVALID_ASSIGNEE', 'برخی سرپرستان انتخاب‌شده معتبر نیستند یا به این کارگاه تعلق ندارند.')
    }

    const isFirstSend = existing.status === 'DRAFT'

    await db.$transaction(async (tx) => {
      for (const userId of targetIds) {
        await tx.taskAssignee.upsert({
          where: { taskId_userId: { taskId: existing.id, userId } },
          update: {},
          create: { taskId: existing.id, userId },
        })
      }
      await tx.dailyTask.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          ...(isFirstSend ? { sentAt: new Date() } : {}),
        },
      })
    })

    await writeAudit({
      user,
      action: 'SEND_DAILY_TASK',
      entityType: 'DailyTask',
      entityId: existing.id,
      newValue: { assigneeIds: targetIds, firstSend: isFirstSend },
      ip,
      userAgent,
    })

    // اعلان فقط به گیرنده‌های تازه
    const previousIds = new Set(existing.assignees.map((a) => a.userId))
    const newIds = targetIds.filter((id) => !previousIds.has(id))
    await notifyUsers({
      userIds: newIds.length > 0 ? newIds : targetIds,
      type: 'TASK_SENT',
      title: 'وظیفهٔ جدید دریافت کردید',
      body: `وظیفهٔ «${existing.title}» برای شما ارسال شد.`,
      entityId: existing.id,
      entityType: 'DailyTask',
    })

    return ok({ sent: true, assigneeCount: targetIds.length })
  },
  {
    permission: 'task.assign',
    schema: sendTaskSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)

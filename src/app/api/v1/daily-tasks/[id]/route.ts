import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { updateTaskSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { canAccessTask, progressPercent, taskDetailInclude, tehranDayStart } from '@/lib/daily'
import { notifyUsers } from '@/lib/notify'
import { hasPermission } from '@/lib/permissions'

// ─────────────────────────── GET /api/v1/daily-tasks/[id] — جزئیات وظیفه ───────────────────────────

export const GET = apiHandler(
  async ({ params, user }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      include: {
        ...taskDetailInclude,
        comments: {
          include: {
            user: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    const allowed = await canAccessTask(user, task)
    if (!allowed) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    const scope = await getUserScope(user)
    const isAssignee = task.assignees.some((a) => a.user.id === user.id)
    const canComplete =
      hasPermission(user.role, 'task.complete') &&
      isAssignee &&
      (task.status === 'PENDING' || task.status === 'IN_PROGRESS')
    const canEdit =
      hasPermission(user.role, 'task.edit') &&
      (scope.isGlobal || task.createdById === user.id || scope.workshopIds.includes(task.workshopId)) &&
      (task.status === 'DRAFT' || task.status === 'PENDING' || task.status === 'IN_PROGRESS')
    const canSend =
      hasPermission(user.role, 'task.assign') &&
      (scope.isGlobal || task.createdById === user.id || scope.workshopIds.includes(task.workshopId)) &&
      (task.status === 'DRAFT' || task.status === 'PENDING')
    const canCancel =
      hasPermission(user.role, 'task.cancel') &&
      (scope.isGlobal || task.createdById === user.id || scope.workshopIds.includes(task.workshopId)) &&
      (task.status === 'DRAFT' || task.status === 'PENDING' || task.status === 'IN_PROGRESS')

    return ok({
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        projectName: task.project.name,
        workshopId: task.workshopId,
        workshopName: task.workshop.name,
        createdById: task.createdById,
        createdByName: task.createdBy.fullName,
        assignedDate: task.assignedDate.toISOString(),
        dueDate: task.dueDate?.toISOString() ?? null,
        sentAt: task.sentAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        completedByName: task.completedBy?.fullName ?? null,
        completionNote: task.completionNote,
        cancelReason: task.cancelReason,
        isOverdue:
          (task.status === 'PENDING' || task.status === 'IN_PROGRESS') &&
          task.dueDate !== null &&
          task.dueDate.getTime() < Date.now(),
        progress: progressPercent(task.items),
        assignees: task.assignees.map((a) => ({
          id: a.user.id,
          fullName: a.user.fullName,
          seenAt: a.seenAt?.toISOString() ?? null,
        })),
        items: task.items.map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          sortOrder: i.sortOrder,
          isCompleted: i.isCompleted,
          completedAt: i.completedAt?.toISOString() ?? null,
          completedByName: i.completedBy?.fullName ?? null,
          completionNote: i.completionNote,
          photos: (i.photos ?? []).map((p) => ({
            id: p.id,
            fileName: p.fileName,
            mimeType: p.mimeType,
            size: p.size,
            createdAt: p.createdAt.toISOString(),
            uploadedByName: p.uploadedBy?.fullName ?? '—',
            url: `/api/v1/daily-photos/${p.id}/file`,
          })),
        })),
        comments: task.comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
          userId: c.user.id,
          userName: c.user.fullName,
        })),
        canComplete,
        canEdit,
        canSend,
        canCancel,
        canComment: true,
      },
    })
  },
  { permission: 'task.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-tasks' } }
)

// ─────────────────────────── PATCH /api/v1/daily-tasks/[id] — ویرایش وظیفه ───────────────────────────

export const PATCH = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const existing = await db.dailyTask.findUnique({
      where: { id: params.id },
      include: { items: true, assignees: true },
    })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    const scope = await getUserScope(user)
    const isCreator = existing.createdById === user.id
    const workshopScoped = scope.isGlobal || isCreator || scope.workshopIds.includes(existing.workshopId)
    if (!workshopScoped) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    // ویرایش فقط پیش از انجام مجاز است (قانون: اصلاح پیش از انجام)
    if (!['DRAFT', 'PENDING', 'IN_PROGRESS'].includes(existing.status)) {
      throw new ApiError(423, 'TASK_NOT_EDITABLE', 'این وظیفه قابل ویرایش نیست (انجام‌شده یا لغو‌شده است).')
    }

    const wasSent = existing.status !== 'DRAFT'

    await db.$transaction(async (tx) => {
      await tx.dailyTask.update({
        where: { id: existing.id },
        data: {
          title: body.title !== undefined ? body.title : undefined,
          description: body.description !== undefined ? body.description : undefined,
          priority: body.priority !== undefined ? body.priority : undefined,
          assignedDate: body.assignedDate !== undefined ? tehranDayStart(body.assignedDate) : undefined,
          dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
        },
      })

      // بازسازی آیتم‌ها — آیتم‌های انجام‌شده هرگز حذف/بازنویسی نمی‌شوند
      if (body.items !== undefined) {
        const keepIds = new Set(body.items.filter((it) => it.id).map((it) => it.id as string))
        for (const item of existing.items) {
          if (item.isCompleted && keepIds.has(item.id)) continue // انجام‌شده دست‌نخورده
          if (item.isCompleted && !keepIds.has(item.id)) {
            throw new ApiError(409, 'COMPLETED_ITEM_REMOVAL', 'آیتم انجام‌شده قابل حذف نیست.')
          }
        }
        await tx.dailyTaskItem.deleteMany({
          where: { taskId: existing.id, isCompleted: false, ...(keepIds.size > 0 ? { id: { notIn: Array.from(keepIds) } } : {}) },
        })
        for (const [idx, it] of body.items.entries()) {
          const sortOrder = it.sortOrder ?? idx
          if (it.id) {
            const current = existing.items.find((x) => x.id === it.id)
            if (current && !current.isCompleted) {
              await tx.dailyTaskItem.update({
                where: { id: it.id },
                data: { title: it.title, description: it.description ?? null, sortOrder },
              })
            }
          } else {
            await tx.dailyTaskItem.create({
              data: { taskId: existing.id, title: it.title, description: it.description ?? null, sortOrder },
            })
          }
        }
      }

      // تغییر گیرنده‌ها — فقط پیش‌نویس یا افزودن به وظیفهٔ ارسال‌شده
      if (body.assigneeIds !== undefined) {
        if (existing.status === 'DRAFT') {
          await tx.taskAssignee.deleteMany({ where: { taskId: existing.id } })
          for (const userId of body.assigneeIds) {
            await tx.taskAssignee.create({ data: { taskId: existing.id, userId } })
          }
        } else {
          // وظیفهٔ ارسال‌شده: فقط افزودن گیرندهٔ جدید — حذف گیرنده مجاز نیست
          const currentIds = new Set(existing.assignees.map((a) => a.userId))
          const toAdd = body.assigneeIds.filter((id) => !currentIds.has(id))
          for (const userId of toAdd) {
            await tx.taskAssignee.create({ data: { taskId: existing.id, userId } })
          }
        }
      }
    })

    await writeAudit({
      user,
      action: 'UPDATE_DAILY_TASK',
      entityType: 'DailyTask',
      entityId: existing.id,
      oldValue: { title: existing.title, priority: existing.priority, status: existing.status },
      newValue: { title: body.title ?? existing.title, priority: body.priority ?? existing.priority },
      ip,
      userAgent,
    })

    // اعلان تغییر وظیفه به گیرنده‌ها — فقط اگر ارسال شده باشد
    if (wasSent) {
      const assignees = await db.taskAssignee.findMany({ where: { taskId: existing.id }, select: { userId: true } })
      await notifyUsers({
        userIds: assignees.map((a) => a.userId),
        type: 'TASK_UPDATED',
        title: 'وظیفه به‌روزرسانی شد',
        body: `وظیفه «${body.title ?? existing.title}» ویرایش شد. لطفاً بررسی کنید.`,
        entityId: existing.id,
        entityType: 'DailyTask',
      })
    }

    return ok({ updated: true })
  },
  {
    permission: 'task.edit',
    schema: updateTaskSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)

// ─────────────────────────── DELETE /api/v1/daily-tasks/[id] — حذف پیش‌نویس ───────────────────────────

export const DELETE = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const existing = await db.dailyTask.findUnique({ where: { id: params.id }, select: { id: true, title: true, status: true, workshopId: true, createdById: true } })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    const scope = await getUserScope(user)
    const allowed = scope.isGlobal || existing.createdById === user.id || scope.workshopIds.includes(existing.workshopId)
    if (!allowed) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    if (existing.status !== 'DRAFT') {
      throw new ApiError(423, 'TASK_NOT_DELETABLE', 'فقط پیش‌نویس قابل حذف است؛ برای وظیفهٔ ارسال‌شده از «لغو» استفاده کنید.')
    }

    await db.dailyTask.delete({ where: { id: existing.id } })

    await writeAudit({
      user,
      action: 'DELETE_DAILY_TASK',
      entityType: 'DailyTask',
      entityId: existing.id,
      oldValue: { title: existing.title, status: existing.status },
      ip,
      userAgent,
    })

    return ok({ deleted: true })
  },
  { permission: 'task.edit', rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-tasks-write' } }
)

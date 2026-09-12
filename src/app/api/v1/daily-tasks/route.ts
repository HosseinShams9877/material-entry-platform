import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { createTaskSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import {
  dailyTaskScopeFilter,
  progressPercent,
  sweepTaskDeadlines,
  tehranDayStart,
  tehranDayEnd,
} from '@/lib/daily'
import { hasPermission } from '@/lib/permissions'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/daily-tasks — فهرست وظایف (Scope-aware) ───────────────────────────

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)
    void sweepTaskDeadlines()

    const url = req.nextUrl
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20') || 20))
    const status = url.searchParams.get('status') // COMPLETED یا COMPLETED,PENDING
    const projectId = url.searchParams.get('projectId')
    const workshopId = url.searchParams.get('workshopId')
    const assigneeId = url.searchParams.get('assigneeId')
    const date = url.searchParams.get('date') // YYYY-MM-DD به وقت تهران
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const overdue = url.searchParams.get('overdue') === '1'
    const mine = url.searchParams.get('mine') === '1'
    const q = url.searchParams.get('q')?.trim()

    const and: Prisma.DailyTaskWhereInput[] = [dailyTaskScopeFilter(scope, user.id)]

    if (status) {
      const list = status.split(',').map((s) => s.trim()).filter(Boolean)
      if (list.length > 0) and.push({ status: { in: list } })
    }
    if (projectId) and.push({ projectId })
    if (workshopId) and.push({ workshopId })
    // فیلتر سرپرست فقط برای مدیران/ادمین معنا دارد — سرپرست همیشه فقط وظایف خودش را می‌بیند
    if (assigneeId && hasPermission(user.role, 'task.assign')) {
      and.push({ assignees: { some: { userId: assigneeId } } })
    }
    if (mine) and.push({ assignees: { some: { userId: user.id } } })
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      and.push({ assignedDate: { gte: tehranDayStart(date), lt: tehranDayEnd(date) } })
    }
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      and.push({ assignedDate: { gte: tehranDayStart(from) } })
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      and.push({ assignedDate: { lt: tehranDayEnd(to) } })
    }
    if (overdue) {
      and.push({
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() },
      })
    }
    if (q) and.push({ title: { contains: q } })

    const where: Prisma.DailyTaskWhereInput = { AND: and }

    const [total, tasks] = await Promise.all([
      db.dailyTask.count({ where }),
      db.dailyTask.findMany({
        where,
        include: {
          project: { select: { name: true } },
          workshop: { select: { name: true } },
          createdBy: { select: { fullName: true } },
          assignees: { include: { user: { select: { id: true, fullName: true } } }, orderBy: { id: 'asc' } },
          items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          sourceAudio: { select: { id: true, transcribeStatus: true } },
        },
        orderBy: [{ assignedDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return ok({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        sourceType: t.sourceType,
        projectId: t.projectId,
        projectName: t.project.name,
        workshopId: t.workshopId,
        workshopName: t.workshop.name,
        createdById: t.createdById,
        createdByName: t.createdBy.fullName,
        assignedDate: t.assignedDate.toISOString(),
        dueDate: t.dueDate?.toISOString() ?? null,
        sentAt: t.sentAt?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        isOverdue:
          (t.status === 'PENDING' || t.status === 'IN_PROGRESS') && t.dueDate !== null && t.dueDate.getTime() < Date.now(),
        itemsCount: t.items.length,
        completedItemsCount: t.items.filter((i) => i.isCompleted).length,
        progress: progressPercent(t.items),
        assignees: t.assignees.map((a) => ({ id: a.user.id, fullName: a.user.fullName })),
        hasAudio: t.sourceAudioId !== null,
        transcribeStatus: t.sourceAudio?.transcribeStatus ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  },
  { permission: 'task.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-tasks' } }
)

// ─────────────────────────── POST /api/v1/daily-tasks — ایجاد وظیفه (پیش‌نویس) ───────────────────────────

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const { projectId, workshopId, title, description, priority, assignedDate, dueDate, assigneeIds: _assigneeIds, items, sourceType, sourceAudioId, sourceTranscript } = body
    const scope = await getUserScope(user)

    // بررسی دسترسی سازنده به کارگاه/پروژه
    if (!scope.isGlobal) {
      if (!scope.workshopIds.includes(workshopId)) {
        throw new ApiError(403, 'FORBIDDEN', 'به این کارگاه دسترسی ندارید.')
      }
      if (scope.projectIds && !scope.projectIds.includes(projectId)) {
        throw new ApiError(403, 'FORBIDDEN', 'به این پروژه دسترسی ندارید.')
      }
    }

    const [workshop, project] = await Promise.all([
      db.workshop.findFirst({ where: { id: workshopId, isActive: true }, select: { id: true } }),
      db.project.findFirst({ where: { id: projectId, isActive: true }, select: { id: true, workshopId: true } }),
    ])
    if (!workshop) throw new ApiError(404, 'NOT_FOUND', 'کارگاه یافت نشد.')
    if (!project) throw new ApiError(404, 'NOT_FOUND', 'پروژه یافت نشد.')

    // صوت دستور — باید متعلق به همین کاربر و مصرف‌نشده باشد
    let audioLink: { id: string } | null = null
    if (sourceAudioId) {
      const audio = await db.dailyAudio.findUnique({
        where: { id: sourceAudioId },
        select: { id: true, uploadedById: true, kind: true },
      })
      if (!audio || audio.uploadedById !== user.id || audio.kind !== 'TASK') {
        throw new ApiError(404, 'NOT_FOUND', 'فایل صوتی یافت نشد.')
      }
      const used = await db.dailyTask.findFirst({ where: { sourceAudioId }, select: { id: true } })
      if (used) throw new ApiError(409, 'AUDIO_USED', 'این فایل صوتی قبلاً به وظیفه‌ای متصل شده است.')
      audioLink = { id: audio.id }
    }

    const task = await db.$transaction(async (tx) => {
      const created = await tx.dailyTask.create({
        data: {
          projectId,
          workshopId,
          title,
          description: description ?? null,
          priority,
          status: 'DRAFT',
          assignedDate: tehranDayStart(assignedDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          createdById: user.id,
          sourceType: sourceAudioId ? 'VOICE' : sourceType,
          sourceAudioId: audioLink?.id ?? null,
          sourceTranscript: sourceTranscript ?? null,
          items: {
            create: items.map((it, idx) => ({
              title: it.title,
              description: it.description ?? null,
              sortOrder: it.sortOrder ?? idx,
            })),
          },
        },
      })
      if (audioLink && sourceTranscript) {
        await tx.dailyAudio.update({
          where: { id: audioLink.id },
          data: { transcript: sourceTranscript.slice(0, 8000) },
        })
      }
      return created
    })

    await writeAudit({
      user,
      action: 'CREATE_DAILY_TASK',
      entityType: 'DailyTask',
      entityId: task.id,
      newValue: {
        title,
        priority,
        projectId,
        workshopId,
        itemsCount: items.length,
        sourceType: sourceAudioId ? 'VOICE' : sourceType,
      },
      ip,
      userAgent,
    })

    return ok({ taskId: task.id }, { status: 201 })
  },
  {
    permission: 'task.create',
    schema: createTaskSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)

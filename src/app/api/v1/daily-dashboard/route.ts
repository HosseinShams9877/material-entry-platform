import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { getUserScope, type UserScope } from '@/lib/scope'
import { dailyTaskScopeFilter, dailyReportScopeFilter, sweepTaskDeadlines, tehranDayStart, tehranDayEnd, todayTehranISO } from '@/lib/daily'
import { hasPermission } from '@/lib/permissions'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/daily-dashboard — داشبورد وظایف و گزارش روزانه ───────────────────────────
// مدیر پروژه / مدیر کارگاه / ادمین: شمارنده‌ها، درصد پیشرفت، وظایف دارای تأخیر،
// گزارش‌های جدید، آخرین فعالیت سرپرستان و Timeline فعالیت‌ها.

export const GET = apiHandler(
  async ({ user }) => {
    const scope: UserScope = await getUserScope(user)
    void sweepTaskDeadlines()

    const taskFilter = dailyTaskScopeFilter(scope, user.id)
    const reportFilter = dailyReportScopeFilter(scope, user.id)
    const todayStart = tehranDayStart(todayTehranISO())
    const todayEnd = tehranDayEnd(todayTehranISO())
    const now = new Date()

    const activeStatuses: Prisma.DailyTaskWhereInput = { status: { in: ['PENDING', 'IN_PROGRESS'] } }

    const [
      completedTasks,
      pendingTasks,
      overdueTasks,
      totalToday,
      newReports,
      recentTasks,
      recentReports,
      timelineLogs,
    ] = await Promise.all([
      db.dailyTask.count({ where: { AND: [taskFilter, { status: 'COMPLETED' }] } }),
      db.dailyTask.count({ where: { AND: [taskFilter, activeStatuses] } }),
      db.dailyTask.findMany({
        where: {
          AND: [
            taskFilter,
            activeStatuses,
            { OR: [{ dueDate: { lt: now } }, { assignedDate: { lt: todayStart }, status: 'PENDING' }] },
          ],
        },
        include: {
          assignees: { include: { user: { select: { fullName: true } } } },
          items: { select: { isCompleted: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      db.dailyTask.count({ where: { AND: [taskFilter, { assignedDate: { gte: todayStart, lt: todayEnd } }] } }),
      db.dailyReport.count({ where: { AND: [reportFilter, { status: 'SUBMITTED' }] } }),
      db.dailyTask.findMany({
        where: { AND: [taskFilter] },
        include: {
          project: { select: { name: true } },
          items: { select: { isCompleted: true } },
          assignees: { include: { user: { select: { fullName: true } } } },
          createdBy: { select: { fullName: true } },
        },
        orderBy: [{ assignedDate: 'desc' }, { createdAt: 'desc' }],
        take: 8,
      }),
      db.dailyReport.findMany({
        where: { AND: [reportFilter] },
        include: {
          reporter: { select: { fullName: true } },
          project: { select: { name: true } },
          workshop: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      hasPermission(user.role, 'audit.view')
        ? db.auditLog.findMany({
            where: { entityType: { in: ['DailyTask', 'DailyTaskItem', 'DailyReport'] } },
            include: { user: { select: { fullName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 15,
          })
        : Promise.resolve([]),
    ])

    // درصد پیشرفت کل وظایف فعال
    const progressItems = await db.dailyTaskItem.findMany({
      where: { task: { AND: [taskFilter, activeStatuses] } },
      select: { isCompleted: true },
    })
    const progress = progressItems.length > 0 ? Math.round((progressItems.filter((i) => i.isCompleted).length / progressItems.length) * 100) : 0

    // آخرین فعالیت هر سرپرست (آخرین تیک یا گزارش)
    const lastSupervisorActivities = await db.auditLog.findMany({
      where: {
        action: { in: ['COMPLETE_TASK_ITEM', 'SUBMIT_DAILY_REPORT', 'COMPLETE_DAILY_TASK'] },
        entityType: { in: ['DailyTaskItem', 'DailyTask', 'DailyReport'] },
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const seen = new Set<string>()
    const supervisorActivity: Array<{ userId: string; fullName: string; lastAt: string; action: string }> = []
    for (const log of lastSupervisorActivities) {
      if (!log.user || seen.has(log.user.id)) continue
      seen.add(log.user.id)
      supervisorActivity.push({
        userId: log.user.id,
        fullName: log.user.fullName,
        lastAt: log.createdAt.toISOString(),
        action: log.action,
      })
      if (supervisorActivity.length >= 5) break
    }

    return ok({
      stats: {
        todayTasks: totalToday,
        completedTasks,
        pendingTasks,
        progressPercent: progress,
        newReports,
        overdueCount: overdueTasks.length,
      },
      overdue: overdueTasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate?.toISOString() ?? null,
        assignees: t.assignees.map((a) => a.user.fullName),
        progress: t.items.length > 0 ? Math.round((t.items.filter((i) => i.isCompleted).length / t.items.length) * 100) : 0,
      })),
      tasks: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        projectName: t.project.name,
        createdByName: t.createdBy.fullName,
        assignedDate: t.assignedDate.toISOString(),
        dueDate: t.dueDate?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        isOverdue: (t.status === 'PENDING' || t.status === 'IN_PROGRESS') && t.dueDate !== null && t.dueDate.getTime() < Date.now(),
        assignees: t.assignees.map((a) => a.user.fullName),
        progress: t.items.length > 0 ? Math.round((t.items.filter((i) => i.isCompleted).length / t.items.length) * 100) : 0,
        createdAt: t.createdAt.toISOString(),
      })),
      reports: recentReports.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        sourceType: r.sourceType,
        reporterName: r.reporter.fullName,
        projectName: r.project.name,
        workshopName: r.workshop.name,
        reportDate: r.reportDate.toISOString(),
        submittedAt: r.submittedAt?.toISOString() ?? null,
        hasAudio: r.audioId !== null,
      })),
      supervisorActivity,
      timeline: timelineLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        userName: log.user?.fullName ?? '—',
        createdAt: log.createdAt.toISOString(),
      })),
    })
  },
  { permission: 'task.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-dashboard' } }
)

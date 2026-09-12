import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type { SessionUser } from '@/lib/auth'
import { getUserScope, type UserScope } from '@/lib/scope'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── هستهٔ مشترک ماژول وظایف و گزارش روزانه ───────────────────────────

/** افست ثابت ایران (+03:30) — ایران از ۱۴۰۱ دیگر Daylight Saving ندارد */
export const IRAN_OFFSET = '+03:30'

/** نیمه‌شب تهرانِ تاریخ «YYYY-MM-DD» به‌صورت Date UTC */
export function tehranDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00${IRAN_OFFSET}`)
}

/** روز بعدِ (YYYY-MM-DD) به‌صورت Date UTC — برای بازه‌های «امروز/تا» */
export function tehranDayEnd(dateStr: string): Date {
  return new Date(`${dateStr}T24:00:00${IRAN_OFFSET}`)
}

/** تاریخ ISO «YYYY-MM-DD» امروز به وقت تهران */
export function todayTehranISO(): string {
  const now = new Date()
  const tehran = new Date(now.getTime() + 3.5 * 3600_000)
  return tehran.toISOString().slice(0, 10)
}

// ─────────────────────────── Scope ───────────────────────────

/**
 * فیلتر Scope وظایف روزانه (IDOR Protection — داخل Query اعمال می‌شود):
 * - سرپرست: فقط وظایفی که به خودش Assignee شده است
 * - مدیر کارگاه: وظایف کارگاه‌های خودش
 * - مدیر پروژه: وظایف پروژه‌های خودش
 * - ادمین: همه
 */
export function dailyTaskScopeFilter(scope: UserScope, userId: string): Prisma.DailyTaskWhereInput {
  if (scope.isGlobal) return {}

  const clauses: Prisma.DailyTaskWhereInput[] = []

  if (scope.workshopIds.length > 0) {
    clauses.push({ workshopId: { in: scope.workshopIds } })
  }
  if (scope.projectIds && scope.projectIds.length > 0) {
    clauses.push({ projectId: { in: scope.projectIds } })
  }
  // سرپرست همیشه وظایف Assignee‌شده به خودش را می‌بیند — حتی اگر دسترسی کارگاه/پروژه ثبت نشده باشد
  clauses.push({ assignees: { some: { userId } } })

  if (clauses.length === 0) return { id: { in: ['__no_access__'] } }
  return { OR: clauses }
}

/** فیلتر Scope گزارش‌های روزانه — سرپرست گزارش‌های خودش؛ مدیر کارگاه کارگاه خودش؛ مدیر پروژه پروژه‌های خودش */
export function dailyReportScopeFilter(scope: UserScope, userId: string): Prisma.DailyReportWhereInput {
  if (scope.isGlobal) return {}

  const clauses: Prisma.DailyReportWhereInput[] = []

  if (scope.workshopIds.length > 0) {
    clauses.push({ workshopId: { in: scope.workshopIds } })
  }
  if (scope.projectIds && scope.projectIds.length > 0) {
    clauses.push({ projectId: { in: scope.projectIds } })
  }
  clauses.push({ reporterId: userId })

  if (clauses.length === 0) return { id: { in: ['__no_access__'] } }
  return { OR: clauses }
}

/** دسترسی به یک وظیفه مشخص — کارگاه/پروژه در Scope یا گیرندهٔ مستقیم وظیفه */
export async function canAccessTask(
  user: SessionUser,
  task: { id?: string; workshopId: string; projectId: string }
): Promise<boolean> {
  const scope = await getUserScope(user)
  if (scope.isGlobal) return true
  if (scope.workshopIds.includes(task.workshopId)) return true
  if (scope.projectIds && scope.projectIds.includes(task.projectId)) return true
  if (task.id) {
    const isAssignee = await db.taskAssignee.findFirst({
      where: { userId: user.id, taskId: task.id },
      select: { id: true },
    })
    if (isAssignee) return true
  }
  return false
}

/** آیا کاربر گیرندهٔ این وظیفه است؟ */
export async function isTaskAssignee(userId: string, taskId: string): Promise<boolean> {
  const a = await db.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
    select: { id: true },
  })
  return a !== null
}

/** دسترسی به یک گزارش روزانه مشخص */
export async function canAccessReport(user: SessionUser, report: { workshopId: string; projectId: string; reporterId: string }): Promise<boolean> {
  const scope = await getUserScope(user)
  if (scope.isGlobal) return true
  if (scope.workshopIds.includes(report.workshopId)) return true
  if (scope.projectIds && scope.projectIds.includes(report.projectId)) return true
  if (report.reporterId === user.id) return true
  return false
}

// ─────────────────────────── Progress ───────────────────────────

export function progressPercent(items: Array<{ isCompleted: boolean }>): number {
  if (items.length === 0) return 0
  const done = items.filter((i) => i.isCompleted).length
  return Math.round((done / items.length) * 100)
}

// ─────────────────────────── Invalidate Deadline Sweep ───────────────────────────
// بدون Cron: هنگام دریافت لیست وظایف (هر نیم‌ساعت حداکثر یک‌بار در هر پروسه) رویدادهای
// «نزدیک شدن مهلت» و «عبور از مهلت» را اعلان می‌کند. وضعیت وظیفه تغییر نمی‌کند —
// فقط اعلان؛ نمایش «دارای تأخیر» به‌صورت محاسباتی (isOverdue) انجام می‌شود.

let lastSweepAt = 0
const SWEEP_INTERVAL_MS = 30 * 60 * 1000
const DUE_SOON_WINDOW_MS = 12 * 3600 * 1000

export async function sweepTaskDeadlines(): Promise<void> {
  const now = Date.now()
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = now
  try {
    const active = await db.dailyTask.findMany({
      where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { not: null } },
      select: {
        id: true,
        title: true,
        dueDate: true,
        createdAt: true,
        assignees: { select: { userId: true } },
      },
      take: 500,
      orderBy: { createdAt: 'desc' },
    })

    const nowMs = Date.now()
    for (const t of active) {
      if (!t.dueDate) continue
      const dueMs = t.dueDate.getTime()
      if (dueMs > nowMs && dueMs - nowMs <= DUE_SOON_WINDOW_MS) {
        // مهلت تا ۱۲ ساعت آینده — اعلان نزدیک بودن فقط یک‌بار: اگر قبلاً برای همین مهلت اعلان شده، صرف‌نظر
        const already = await db.notification.findFirst({
          where: { type: 'TASK_DUE_SOON', entityId: t.id, createdAt: { gte: new Date(dueMs - DUE_SOON_WINDOW_MS) } },
          select: { id: true },
        })
        if (!already) {
          await notifyUsers({
            userIds: t.assignees.map((a) => a.userId),
            type: 'TASK_DUE_SOON',
            title: 'مهلت وظیفه نزدیک است',
            body: `وظیفه «${t.title}» به‌زودی مهلت می‌شود.`,
            entityId: t.id,
            entityType: 'DailyTask',
          })
        }
      } else if (dueMs <= nowMs) {
        // عبور از مهلت — اعلان تأخیر روزانه (حداکثر یک‌بار در روز برای هر وظیفه)
        const alreadyToday = await db.notification.findFirst({
          where: { type: 'TASK_OVERDUE', entityId: t.id, createdAt: { gte: new Date(nowMs - 24 * 3600_000) } },
          select: { id: true },
        })
        if (!alreadyToday) {
          await notifyUsers({
            userIds: t.assignees.map((a) => a.userId),
            type: 'TASK_OVERDUE',
            title: 'وظیفه دارای تأخیر',
            body: `مهلت وظیفه «${t.title}» گذشته است.`,
            entityId: t.id,
            entityType: 'DailyTask',
          })
        }
      }
    }
  } catch {
    // Sweep اطلاع‌رسانی اختیاری است — هرگز مسیر اصلی را شکست نمی‌دهد
  }
}

// ─────────────────────────── کمکی‌های تکمیل وظیفه ───────────────────────────

/** شناسهٔ مدیران پروژهٔ دارای دسترسی به پروژه — دریافت اعلان تکمیل/گزارش */
export async function projectManagerIds(projectId: string): Promise<string[]> {
  const pms = await db.user.findMany({
    where: {
      isActive: true,
      role: 'PROJECT_MANAGER',
      userProjects: { some: { projectId } },
    },
    select: { id: true },
  })
  return pms.map((p) => p.id)
}

/**
 * تکمیل خودکار وظیفه اگر همهٔ آیتم‌ها انجام شده باشند.
 * خروجی: آیا وظیفه در این فراخوانی COMPLETED شد؟
 */
export async function completeTaskWhenAllItemsDone(
  taskId: string,
  completedById: string,
  completionNote: string | null
): Promise<boolean> {
  const remaining = await db.dailyTaskItem.count({ where: { taskId, isCompleted: false } })
  if (remaining > 0) return false

  const task = await db.dailyTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, title: true, projectId: true, createdById: true },
  })
  if (!task || task.status === 'COMPLETED' || task.status === 'CANCELLED') return false

  const now = new Date()
  await db.dailyTask.update({
    where: { id: taskId },
    data: { status: 'COMPLETED', completedAt: now, completedById, completionNote },
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
  return true
}

// ─────────────────────────── Select مشترک ───────────────────────────

/** Include کامل وظیفه برای جزئیات */
export const taskDetailInclude = {
  project: { select: { id: true, name: true, code: true } },
  workshop: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, fullName: true, role: true } },
  completedBy: { select: { id: true, fullName: true } },
  assignees: {
    include: { user: { select: { id: true, fullName: true, role: true } } },
    orderBy: { id: 'asc' as const },
  },
  items: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      completedBy: { select: { id: true, fullName: true } },
      photos: {
        select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true, uploadedBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  sourceAudio: { select: { id: true, fileName: true, mimeType: true, size: true, transcribeStatus: true } },
} satisfies Prisma.DailyTaskInclude

/** Include گزارش روزانه */
export const reportDetailInclude = {
  project: { select: { id: true, name: true, code: true } },
  workshop: { select: { id: true, name: true, code: true } },
  reporter: { select: { id: true, fullName: true, role: true } },
  reviewedBy: { select: { id: true, fullName: true } },
  audio: { select: { id: true, fileName: true, mimeType: true, size: true, transcribeStatus: true } },
} satisfies Prisma.DailyReportInclude

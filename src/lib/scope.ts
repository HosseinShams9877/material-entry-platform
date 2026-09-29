import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

/**
 * Data Scope Chain — زنجیره دسترسی داده.
 * تمام Queryهای وابسته به کاربر از این توابع عبور می‌کنند.
 * Frontend Filtering هرگز به‌عنوان Security استفاده نمی‌شود.
 */

export interface UserScope {
  workshopIds: string[] // کارگاه‌هایی که کاربر به آن‌ها دسترسی دارد
  projectIds: string[] | null // null = محدود به پروژه نیست
  isGlobal: boolean // PROJECT_MANAGER
}

/** محاسبه Scope کاربر بر اساس نقش و دسترسی‌های ثبت‌شده */
export async function getUserScope(user: SessionUser): Promise<UserScope> {
  // مدیر پروژه‌ها — دید سازمانی کامل
  if (user.role === 'PROJECT_MANAGER') {
    return { workshopIds: [], projectIds: null, isGlobal: true }
  }

  const [userWorkshops, userProjects] = await Promise.all([
    db.userWorkshop.findMany({ where: { userId: user.id }, select: { workshopId: true } }),
    db.userProject.findMany({ where: { userId: user.id }, select: { projectId: true } }),
  ])

  const workshopIds = new Set(userWorkshops.map((uw) => uw.workshopId))
  if (user.workshopId) workshopIds.add(user.workshopId)

  return {
    workshopIds: Array.from(workshopIds),
    projectIds: userProjects.length > 0 ? userProjects.map((up) => up.projectId) : null,
    isGlobal: false,
  }
}

/**
 * فیلتر Scope برای MaterialEntry — داخل خود Query اعمال می‌شود (IDOR Protection).
 * خروجی مستقیماً در where استفاده می‌شود.
 */
export function entryScopeFilter(scope: UserScope): Prisma.MaterialEntryWhereInput {
  if (scope.isGlobal) return {}

  // سرپرست/مدیر کارگاه: فقط رکوردهای کارگاه خودش
  // مدیر پروژه: رکوردهای مرتبط با پروژه‌های خودش (از هر کارگاهی که به آن پروژه دسترسی دارد)
  const clauses: Prisma.MaterialEntryWhereInput[] = []

  if (scope.workshopIds.length > 0) {
    clauses.push({ workshopId: { in: scope.workshopIds } })
  }
  if (scope.projectIds && scope.projectIds.length > 0) {
    clauses.push({ projects: { some: { projectId: { in: scope.projectIds } } } })
  }
  if (clauses.length === 0) {
    // هیچ دسترسی‌ای ندارد → رکوردی برنگردان
    return { id: { in: ['__no_access__'] } }
  }
  return { OR: clauses }
}

/** آیا کاربر به یک Entry مشخص دسترسی دارد؟ (برای GET/PATCH/Actionها) */
export async function canAccessEntry(
  user: SessionUser,
  entry: { id?: string; workshopId: string }
): Promise<boolean> {
  const scope = await getUserScope(user)
  if (scope.isGlobal) return true
  if (scope.workshopIds.includes(entry.workshopId)) return true
  if (entry.id && scope.projectIds && scope.projectIds.length > 0) {
    const link = await db.materialEntryProject.findFirst({
      where: { entryId: entry.id, projectId: { in: scope.projectIds } },
      select: { id: true },
    })
    if (link) return true
  }
  return false
}

/**
 * آیا کاربر می‌تواند این Entry را Review کند؟
 * مدیر پروژه فقط پروژه‌های خودش؛ مدیر کارگاه فقط کارگاه خودش.
 */
export async function canReviewEntry(user: SessionUser, entry: { workshopId: string; id: string }): Promise<boolean> {
  const scope = await getUserScope(user)
  if (scope.isGlobal) return true
  if (scope.workshopIds.includes(entry.workshopId)) return true
  if (scope.projectIds && scope.projectIds.length > 0) {
    const link = await db.materialEntryProject.findFirst({
      where: { entryId: entry.id, projectId: { in: scope.projectIds } },
      select: { id: true },
    })
    if (link) return true
  }
  return false
}

/** Scope برای Master Data (تأمین‌کننده/مصالح/کارگر) — جلوگیری از نشت داده بین کارگاه‌ها */
export function masterDataScopeFilter(scope: UserScope): Record<string, unknown> {
  if (scope.isGlobal) return {}
  if (scope.workshopIds.length === 0) return { id: { in: ['__no_access__'] } }
  return { workshopId: { in: scope.workshopIds } }
}

/**
 * فیلتر Scope بر اساس کارگاه — برای ماژول‌های کارگاه‌محور (صورت وضعیت، خرید، گزارش کار).
 * خروجی مستقیماً در where (روی رابطهٔ workshop) استفاده می‌شود.
 */
export function workshopScopeFilter(scope: UserScope): Prisma.WorkshopWhereInput {
  if (scope.isGlobal) return {}
  if (scope.workshopIds.length === 0) return { id: { in: ['__no_access__'] } }
  return { id: { in: scope.workshopIds } }
}

/**
 * فیلتر Scope «کارگاه یا پروژه» — برای ماژول‌های کارگاه‌محور (صورت وضعیت، خرید، گزارش کار).
 * کاربر با دسترسی کارگاهی یا دسترسی پروژه‌ای رکورد را می‌بیند (OR) — مانند entryScopeFilter.
 */
export function workshopOrProjectScopeFilter(scope: UserScope): { OR?: Array<Record<string, unknown>>; id?: { in: string[] } } {
  if (scope.isGlobal) return {}
  const clauses: Array<Record<string, unknown>> = []
  if (scope.workshopIds.length > 0) clauses.push({ workshopId: { in: scope.workshopIds } })
  if (scope.projectIds && scope.projectIds.length > 0) clauses.push({ projectId: { in: scope.projectIds } })
  if (clauses.length === 0) return { id: { in: ['__no_access__'] } }
  return { OR: clauses }
}

/**
 * فیلتر Scope انبار — موجودی انبار کارگاهی است، اما مدیر پروژه (با دسترسی پروژه‌ای
 * و بدون دسترسی کارگاهی) انبارِ کارگاه‌های میزبان پروژه‌های خودش را می‌بیند.
 */
export async function inventoryScopeFilterFor(user: SessionUser, scope: UserScope): Promise<Record<string, unknown>> {
  if (scope.isGlobal) return {}
  if (scope.workshopIds.length > 0) return { workshopId: { in: scope.workshopIds } }
  if (scope.projectIds && scope.projectIds.length > 0) {
    const rows = await db.project.findMany({
      where: { id: { in: scope.projectIds }, workshopId: { not: null } },
      select: { workshopId: true },
    })
    const ids = Array.from(new Set(rows.map((r) => r.workshopId).filter((x): x is string => !!x)))
    if (ids.length > 0) return { workshopId: { in: ids } }
  }
  return { workshopId: { in: ['__no_access__'] } }
}

/** آیا کاربر به رکورد کارگاه‌محور دسترسی دارد؟ (کارگاه یا پروژه یا مالکیت — برای GET/PATCH/Actionها) */
export function canAccessWorkshopRecord(
  scope: UserScope,
  record: { workshopId: string; projectId?: string | null; createdById?: string },
  userId: string
): boolean {
  if (scope.isGlobal) return true
  if (scope.workshopIds.includes(record.workshopId)) return true
  if (
    record.projectId &&
    scope.projectIds &&
    scope.projectIds.length > 0 &&
    scope.projectIds.includes(record.projectId)
  ) {
    return true
  }
  return record.createdById === userId
}

// ─────────────────────────── دسترسی پیوست‌های چندموجودیتی ───────────────────────────

export type AttachmentEntity = 'ENTRY' | 'STATEMENT' | 'WORK_REPORT'

export interface AttachmentAccess {
  exists: boolean
  canView: boolean
  canManage: boolean // افزودن/حذف پیوست روی موجودیت
}

/**
 * بررسی دسترسی یکپارچه برای پیوست‌های همهٔ موجودیت‌ها:
 * - ENTRY: سرپرستِ ثبت‌کننده / ادمین مدیریت می‌کنند؛ مشاهده با Scope
 * - STATEMENT: ایجادکننده / مدیر کارگاه / ادمین مدیریت می‌کنند؛ مشاهده با مجوز statement.view + Scope
 * - WORK_REPORT: ایجادکننده / مدیر کارگاه / ادمین مدیریت می‌کنند؛ مشاهده با مجوز workreport.view + Scope
 */
export async function resolveAttachmentAccess(
  user: SessionUser,
  entityType: string,
  entityId: string
): Promise<AttachmentAccess> {
  const scope = await getUserScope(user)
  const isSuper = user.role === 'PROJECT_MANAGER'

  if (entityType === 'STATEMENT') {
    const st = await db.progressStatement.findUnique({
      where: { id: entityId },
      select: { workshopId: true, createdById: true },
    })
    if (!st) return { exists: false, canView: false, canManage: false }
    const canView = isSuper || canAccessWorkshopRecord(scope, st, user.id)
    return { exists: true, canView, canManage: canView && (st.createdById === user.id || user.role === 'PROJECT_MANAGER' || isSuper) }
  }

  if (entityType === 'WORK_REPORT') {
    const rep = await db.workReport.findUnique({
      where: { id: entityId },
      select: { workshopId: true, createdById: true },
    })
    if (!rep) return { exists: false, canView: false, canManage: false }
    const canView = isSuper || canAccessWorkshopRecord(scope, rep, user.id)
    return { exists: true, canView, canManage: canView && (rep.createdById === user.id || user.role === 'PROJECT_MANAGER' || isSuper) }
  }

  // ENTRY (پیش‌فرض) — سازگار با رفتار قبلی
  const entry = await db.materialEntry.findUnique({
    where: { id: entityId },
    select: { workshopId: true, supervisorId: true, id: true },
  })
  if (!entry) return { exists: false, canView: false, canManage: false }
  const canView = await canAccessEntry(user, { id: entry.id, workshopId: entry.workshopId })
  return { exists: true, canView, canManage: canView && (entry.supervisorId === user.id || isSuper) }
}

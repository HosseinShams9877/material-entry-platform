import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { getUserScope, masterDataScopeFilter } from '@/lib/scope'

/**
 * Master Data یکجا برای فرم‌ها — همیشه Scope-Aware:
 * سرپرست فقط مصالح/تأمین‌کننده/کارگر/پروژه‌های کارگاه خودش را می‌بیند.
 */
export const GET = apiHandler(async ({ user }) => {
  const scope = await getUserScope(user)
  const mdFilter = masterDataScopeFilter(scope)

  const [workshops, projects, materials, suppliers, workers, units, supervisors] = await Promise.all([
    db.workshop.findMany({
      where: scope.isGlobal ? { isActive: true } : { isActive: true, id: { in: scope.workshopIds.length ? scope.workshopIds : ['__none__'] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    db.project.findMany({
      where: {
        isActive: true,
        ...(scope.isGlobal
          ? {}
          : scope.projectIds
            ? { id: { in: scope.projectIds } }
            : { workshopId: { in: scope.workshopIds.length ? scope.workshopIds : ['__none__'] } }),
      },
      select: { id: true, name: true, code: true, workshopId: true },
      orderBy: { name: 'asc' },
    }),
    db.material.findMany({ where: { isActive: true, ...mdFilter }, select: { id: true, name: true, category: true, categoryId: true, defaultUnit: true }, orderBy: { name: 'asc' } }),
    // تأمین‌کنندگان چند-کارگاهی — کارگاه اصلی یا دسترسی چند-کارگاهی
    db.supplier.findMany({
      where: {
        isActive: true,
        ...(scope.isGlobal
          ? {}
          : scope.workshopIds.length
            ? { OR: [{ workshopId: { in: scope.workshopIds } }, { workshopAccess: { some: { workshopId: { in: scope.workshopIds } } } }] }
            : { id: { in: ['__no_access__'] } }),
      },
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    }),
    db.worker.findMany({ where: { isActive: true, ...mdFilter }, select: { id: true, fullName: true, kind: true }, orderBy: { fullName: 'asc' } }),
    db.materialUnit.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    // سرپرستانِ در دسترس مدیر کارگاه — برای ارسال وظیفهٔ روزانه (Scope-aware)
    // گیرندگانِ در دسترس مدیر — سرپرست، انباردار و کارگر (Item ۷) — برای ارسال وظیفهٔ روزانه (Scope-aware)
    // همهٔ کسانی که به کارگاه یا پروژه‌های در دسترس کاربر دسترسی دارند (Item ۵—b)
    db.user.findMany({
      where: {
        isActive: true,
        role: { in: ['SITE_SUPERVISOR', 'WAREHOUSE_KEEPER', 'FIELD_WORKER'] },
        ...(scope.isGlobal
          ? {}
          : {
              OR: [
                { workshopId: { in: scope.workshopIds.length ? scope.workshopIds : ['__none__'] } },
                { userWorkshops: { some: { workshopId: { in: scope.workshopIds } } } },
                ...(scope.projectIds && scope.projectIds.length > 0
                  ? [{ userProjects: { some: { projectId: { in: scope.projectIds } } } }]
                  : []),
              ],
            }),
      },
      select: {
        id: true,
        fullName: true,
        workshopId: true,
        role: true,
        // Item ۵—b: دسترسی‌های کارگاه/پروژه برای فیلتر سمت کلاینت بر اساس پروژهٔ انتخاب‌شده
        userWorkshops: { select: { workshopId: true } },
        userProjects: { select: { projectId: true } },
      },
      orderBy: { fullName: 'asc' },
    }),
  ])

  return ok({ workshops, projects, materials, suppliers, workers, units, supervisors })
}, { rateLimit: { limit: 60, windowMs: 60_000, scope: 'master' } })

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
    db.material.findMany({ where: { isActive: true, ...mdFilter }, select: { id: true, name: true, category: true, defaultUnit: true }, orderBy: { name: 'asc' } }),
    db.supplier.findMany({ where: { isActive: true, ...mdFilter }, select: { id: true, name: true, phone: true }, orderBy: { name: 'asc' } }),
    db.worker.findMany({ where: { isActive: true, ...mdFilter }, select: { id: true, fullName: true, kind: true }, orderBy: { fullName: 'asc' } }),
    db.materialUnit.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    // سرپرستانِ در دسترس مدیر کارگاه — برای ارسال وظیفهٔ روزانه (Scope-aware)
    db.user.findMany({
      where: {
        isActive: true,
        role: 'WORKSHOP_SUPERVISOR',
        ...(scope.isGlobal
          ? {}
          : { OR: [{ workshopId: { in: scope.workshopIds.length ? scope.workshopIds : ['__none__'] } }, { userWorkshops: { some: { workshopId: { in: scope.workshopIds } } } }] }),
      },
      select: { id: true, fullName: true, workshopId: true },
      orderBy: { fullName: 'asc' },
    }),
  ])

  return ok({ workshops, projects, materials, suppliers, workers, units, supervisors })
}, { rateLimit: { limit: 60, windowMs: 60_000, scope: 'master' } })

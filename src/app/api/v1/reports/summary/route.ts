import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { getUserScope, entryScopeFilter } from '@/lib/scope'
import { hasPermission } from '@/lib/permissions'
import { ApiError } from '@/lib/api'

/** گزارش‌های Scope-Aware: تفکیک بر اساس مصالح / تأمین‌کننده / پروژه / نوع ورود */
export const GET = apiHandler(async ({ user }) => {
  if (!hasPermission(user.role, 'reports.view')) {
    throw new ApiError(403, 'FORBIDDEN', 'به گزارش‌ها دسترسی ندارید.')
  }
  const scope = await getUserScope(user)
  const baseWhere = entryScopeFilter(scope)

  const [byType, byMaterial, bySupplier, byProject, totals] = await Promise.all([
    db.materialEntry.groupBy({ by: ['type'], where: baseWhere, _count: { _all: true } }),
    db.materialEntryItem.groupBy({
      by: ['materialName', 'unit'],
      where: { entry: baseWhere },
      _sum: { quantity: true },
      _count: { _all: true },
    }),
    db.materialEntry.groupBy({ by: ['sourceSupplierId'], where: { AND: [baseWhere, { sourceSupplierId: { not: null } }] }, _count: { _all: true } }),
    db.materialEntryProject.groupBy({ by: ['projectId'], where: { entry: baseWhere }, _count: { _all: true } }),
    Promise.all([
      db.materialEntry.count({ where: baseWhere }),
      db.materialEntry.count({ where: { AND: [baseWhere, { type: 'TRANSFER' }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { type: 'LOAN' }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { type: 'RETURN' }] } }),
    ]),
  ])

  const supplierIds = bySupplier.map((s) => s.sourceSupplierId).filter((x): x is string => !!x)
  const projectIds = byProject.map((p) => p.projectId)
  const [supplierNames, projectNames] = await Promise.all([
    db.supplier.findMany({ where: { id: { in: supplierIds.length ? supplierIds : ['__none__'] } }, select: { id: true, name: true } }),
    db.project.findMany({ where: { id: { in: projectIds.length ? projectIds : ['__none__'] } }, select: { id: true, name: true } }),
  ])

  return ok({
    totals: { entries: totals[0], transfers: totals[1], loans: totals[2], returns: totals[3] },
    byType: byType.map((t) => ({ type: t.type, count: t._count._all })),
    byMaterial: byMaterial
      .map((m) => ({ materialName: m.materialName, unit: m.unit, totalQuantity: m._sum.quantity ?? 0, entries: m._count._all }))
      .sort((a, b) => b.entries - a.entries)
      .slice(0, 20),
    bySupplier: bySupplier.map((s) => ({
      name: supplierNames.find((sn) => sn.id === s.sourceSupplierId)?.name ?? '—',
      count: s._count._all,
    })),
    byProject: byProject.map((p) => ({
      name: projectNames.find((pn) => pn.id === p.projectId)?.name ?? '—',
      count: p._count._all,
    })),
  })
}, { rateLimit: { limit: 30, windowMs: 60_000, scope: 'reports' } })

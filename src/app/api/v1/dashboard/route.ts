import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { getUserScope, entryScopeFilter } from '@/lib/scope'
import { hasPermission } from '@/lib/permissions'
import { dailyTaskScopeFilter, dailyReportScopeFilter } from '@/lib/daily'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Dashboard role-aware — سرپرست و مدیر داده‌های متفاوت می‌گیرند */
export const GET = apiHandler(async ({ user }) => {
  const scope = await getUserScope(user)
  const baseWhere = entryScopeFilter(scope)
  // شاخهٔ «عملیاتی»: همهٔ نقش‌های به‌جز مدیر پروژه/ادمین (انباردار/ناظر/بیننده هم لیستی می‌بینند)
  const isSupervisor = ['WORKSHOP_SUPERVISOR', 'WORKSHOP_MANAGER', 'WAREHOUSE_MANAGER', 'INSPECTOR', 'VIEWER'].includes(user.role)
  const canReview = hasPermission(user.role, 'entry.review')

  const today = startOfToday()

  if (isSupervisor) {
    // داشبورد سرپرست: وضعیت ثبت‌های امروز + آخرین ثبت‌ها
    const [todayTotal, todayApproved, todayPending, todayCorrection, todayRejected, recent] = await Promise.all([
      db.materialEntry.count({ where: { AND: [baseWhere, { createdAt: { gte: today } }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { status: 'APPROVED' }, { createdAt: { gte: today } }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { status: { in: ['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED'] } }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { status: 'CORRECTION_REQUESTED' }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { status: 'REJECTED' }, { createdAt: { gte: today } }] } }),
      db.materialEntry.findMany({
        where: baseWhere,
        include: {
          items: { orderBy: { sortOrder: 'asc' }, take: 3 },
          projects: { include: { project: { select: { name: true } } } },
          supervisor: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    return ok({
      role: 'SUPERVISOR',
      today: { total: todayTotal, approved: todayApproved, rejected: todayRejected },
      pending: todayPending,
      correction: todayCorrection,
      recent: recent.map((e) => ({
        id: e.id,
        entryNumber: e.entryNumber,
        status: e.status,
        type: e.type,
        supervisorName: e.supervisor.fullName,
        projects: e.projects.map((p) => p.project.name),
        firstItem: e.items[0] ? { materialName: e.items[0].materialName, quantity: e.items[0].quantity, unit: e.items[0].unit } : null,
        itemsCount: e.items.length,
        createdAt: e.createdAt,
      })),
    })
  }

  // ── داشبورد مدیر ──
  const [todayTotal, pendingCount, rejectedCount, correctionCount, approvedCount, byType, byProject, topSuppliers, transfers, loans] =
    await Promise.all([
      db.materialEntry.count({ where: { AND: [baseWhere, { submittedAt: { gte: today } }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { status: { in: ['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED'] } }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { status: 'REJECTED' }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { status: 'CORRECTION_REQUESTED' }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { status: { in: ['APPROVED', 'LOCKED'] } }] } }),
      db.materialEntry.groupBy({ by: ['type'], where: baseWhere, _count: { _all: true } }),
      db.materialEntryProject.groupBy({
        by: ['projectId'],
        where: { entry: baseWhere },
        _count: { _all: true },
      }),
      db.materialEntry.groupBy({ by: ['sourceSupplierId'], where: { AND: [baseWhere, { sourceSupplierId: { not: null } }] }, _count: { _all: true } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { type: 'TRANSFER' }] } }),
      db.materialEntry.count({ where: { AND: [baseWhere, { type: 'LOAN' }] } }),
    ])

    const projectIds = byProject.map((b) => b.projectId)
    const projectNames = await db.project.findMany({ where: { id: { in: projectIds.length ? projectIds : ['__none__'] } }, select: { id: true, name: true } })
    const supplierIds = topSuppliers.map((s) => s.sourceSupplierId).filter((x): x is string => !!x)
    const supplierNames = await db.supplier.findMany({ where: { id: { in: supplierIds.length ? supplierIds : ['__none__'] } }, select: { id: true, name: true } })

  const pendingReview = canReview
    ? await db.materialEntry.findMany({
        where: { AND: [baseWhere, { status: { in: ['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED', 'TECH_REVIEW'] } }] },
        include: {
          items: { orderBy: { sortOrder: 'asc' }, take: 3 },
          projects: { include: { project: { select: { name: true } } } },
          supervisor: { select: { fullName: true } },
        },
        orderBy: { submittedAt: 'asc' },
        take: 6,
      })
    : []

  // ── KPI های Enterprise ──
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [approvedSince, supervisorsSet, trendRows, byWorkshopGroup, openTasks, doneTasksToday, reportsToday] = await Promise.all([
    db.materialEntry.findMany({
      where: { AND: [baseWhere, { status: { in: ['APPROVED', 'LOCKED', 'WAREHOUSE_CONFIRMED', 'DELIVERED', 'CLOSED'] } }, { decidedAt: { not: null } }, { submittedAt: { not: null } }, { decidedAt: { gte: last30 } }] },
      select: { supervisorId: true, submittedAt: true, decidedAt: true },
    }),
    db.materialEntry.findMany({
      where: { AND: [baseWhere, { createdAt: { gte: last30 } }] },
      select: { supervisorId: true, status: true },
    }),
    db.materialEntry.findMany({
      where: { AND: [baseWhere, { createdAt: { gte: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000) } }] },
      select: { createdAt: true },
    }),
    db.materialEntry.groupBy({ by: ['workshopId', 'status'], where: baseWhere, _count: { _all: true } }),
    db.dailyTask.count({ where: { AND: [dailyTaskScopeFilter(scope, user.id), { status: { in: ['PENDING', 'IN_PROGRESS'] } }] } }),
    db.dailyTask.count({ where: { AND: [dailyTaskScopeFilter(scope, user.id), { status: 'COMPLETED' }, { completedAt: { gte: startOfToday() } }] } }),
    db.dailyReport.count({ where: { AND: [dailyReportScopeFilter(scope, user.id), { reportDate: { gte: startOfToday() } }] } }),
  ])

  // میانگین زمان تأیید (دقیقه) — کل + به تفکیک سرپرست
  const approvalDurations = approvedSince
    .map((e) => (e.decidedAt && e.submittedAt ? (e.decidedAt.getTime() - e.submittedAt.getTime()) / 60000 : null))
    .filter((m): m is number => m !== null && m >= 0)
  const avgApprovalMinutes = approvalDurations.length > 0 ? Math.round(approvalDurations.reduce((a, b) => a + b, 0) / approvalDurations.length) : null

  // عملکرد سرپرستان — ۳۰ روز اخیر (ثبت‌ها + نرخ تأیید + میانگین تأیید)
  const perfMap = new Map<string, { total: number; approved: number; rejected: number; durations: number[] }>()
  const durBySupervisor = new Map<string, number[]>()
  for (const e of approvedSince) {
    if (!e.decidedAt || !e.submittedAt) continue
    const arr = durBySupervisor.get(e.supervisorId) ?? []
    arr.push((e.decidedAt.getTime() - e.submittedAt.getTime()) / 60000)
    durBySupervisor.set(e.supervisorId, arr)
  }
  for (const r of supervisorsSet) {
    const rec = perfMap.get(r.supervisorId) ?? { total: 0, approved: 0, rejected: 0, durations: [] }
    rec.total += 1
    if (['APPROVED', 'LOCKED', 'WAREHOUSE_CONFIRMED', 'DELIVERED', 'CLOSED'].includes(r.status)) rec.approved += 1
    if (r.status === 'REJECTED') rec.rejected += 1
    perfMap.set(r.supervisorId, rec)
  }
  const supervisorIds = Array.from(perfMap.keys())
  const supervisorNames = supervisorIds.length > 0
    ? await db.user.findMany({ where: { id: { in: supervisorIds } }, select: { id: true, fullName: true } })
    : []
  const supervisorPerformance = supervisorIds
    .map((sid) => {
      const rec = perfMap.get(sid) ?? { total: 0, approved: 0, rejected: 0, durations: [] }
      const durations = durBySupervisor.get(sid) ?? []
      return {
        supervisorId: sid,
        name: supervisorNames.find((u) => u.id === sid)?.fullName ?? '—',
        total: rec.total,
        approved: rec.approved,
        rejected: rec.rejected,
        avgApprovalMinutes: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  // روند ۱۴ روز — شمارش ثبت به تفکیک روز
  const trend: Array<{ date: string; count: number }> = []
  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const buckets = new Map<string, number>()
  for (const r of trendRows) buckets.set(dayKey(r.createdAt), (buckets.get(dayKey(r.createdAt)) ?? 0) + 1)
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000))
    trend.push({ date: key, count: buckets.get(key) ?? 0 })
  }

  // وضعیت به تفکیک کارگاه
  const workshopGroupIds = Array.from(new Set(byWorkshopGroup.map((g) => g.workshopId)))
  const workshopNames = workshopGroupIds.length > 0
    ? await db.workshop.findMany({ where: { id: { in: workshopGroupIds } }, select: { id: true, name: true } })
    : []
  const byWorkshop = workshopGroupIds.slice(0, 6).map((wid) => {
    const rows = byWorkshopGroup.filter((g) => g.workshopId === wid)
    const get = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((a, r) => a + r._count._all, 0)
    return {
      workshopId: wid,
      workshopName: workshopNames.find((w) => w.id === wid)?.name ?? '—',
      approved: get(['APPROVED', 'LOCKED', 'WAREHOUSE_CONFIRMED', 'DELIVERED', 'CLOSED']),
      pending: get(['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED', 'TECH_REVIEW', 'CORRECTION_REQUESTED']),
      rejected: get(['REJECTED']),
    }
  })

  // تأخیر تأیید — ثبت‌های در انتظار بیش از ۲۴ ساعت
  const delayedCount = await db.materialEntry.count({
    where: { AND: [baseWhere, { status: { in: ['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED', 'TECH_REVIEW'] } }, { submittedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] },
  })

  return ok({
    role: 'MANAGER',
    today: { total: todayTotal },
    counts: { pending: pendingCount, rejected: rejectedCount, correction: correctionCount, approved: approvedCount },
    kpis: {
      avgApprovalMinutes,
      delayedCount,
      openTasks,
      completedTasksToday: doneTasksToday,
      reportsToday,
    },
    trend,
    byWorkshop,
    supervisorPerformance,
    byType: byType.map((t) => ({ type: t.type, count: t._count._all })),
    byProject: byProject.map((p) => ({
      projectId: p.projectId,
      name: projectNames.find((pn) => pn.id === p.projectId)?.name ?? '—',
      count: p._count._all,
    })),
    suppliers: topSuppliers.map((s) => ({
      name: supplierNames.find((sn) => sn.id === s.sourceSupplierId)?.name ?? '—',
      count: s._count._all,
    })),
    transfers,
    loans,
    pendingReview: pendingReview.map((e) => ({
      id: e.id,
      entryNumber: e.entryNumber,
      status: e.status,
      type: e.type,
      supervisorName: e.supervisor.fullName,
      projects: e.projects.map((p) => p.project.name),
      firstItem: e.items[0] ? { materialName: e.items[0].materialName, quantity: e.items[0].quantity, unit: e.items[0].unit } : null,
      itemsCount: e.items.length,
      submittedAt: e.submittedAt,
    })),
  })
}, { rateLimit: { limit: 60, windowMs: 60_000, scope: 'dashboard' } })

import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { getUserScope, workshopOrProjectScopeFilter } from '@/lib/scope'
import { gregorianToJalali, jalaliMonthLabel } from '@/lib/fa'
import { hasPermission } from '@/lib/permissions'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/performance — ارزیابی و KPI ماهانهٔ نیروها ───────────────────────────
// طبق سند سیستم یکپارچه: «ارزیابی و KPI — تعریف شرح وظایف، اهداف ماهانه و نمایش درصد تحقق و عملکرد هر فرد»
// + تجمیع خودکار دوره‌ای (گزارش روزانه → خلاصهٔ ماهانه به تفکیک کارگاه).

function monthRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start, end }
}

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)
    const url = req.nextUrl
    const now = new Date()
    const monthParam = url.searchParams.get('month')
    const period =
      monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)
        ? monthParam
        : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

    const { start, end } = monthRange(period)
    const reportScope = workshopOrProjectScopeFilter(scope) as Prisma.WorkReportWhereInput
    const reportWhere: Prisma.WorkReportWhereInput = {
      AND: [reportScope, { reportDate: { gte: start, lt: end } }, { workerId: { not: null } }],
    }

    const [grouped, byWorkshopGroup, goals] = await Promise.all([
      db.workReport.groupBy({
        by: ['workerId'],
        where: reportWhere,
        _count: { _all: true },
        _sum: { crewCount: true },
        _max: { reportDate: true },
      }),
      db.workReport.groupBy({
        by: ['workshopId'],
        where: { AND: [reportScope, { reportDate: { gte: start, lt: end } }] },
        _count: { _all: true },
        _sum: { crewCount: true },
      }),
      db.workerGoal.findMany({ where: { period } }),
    ])

    const workerIds = grouped.map((g) => g.workerId).filter((x): x is string => !!x)
    const goalWorkerIds = goals.map((g) => g.workerId)
    const allIds = Array.from(new Set([...workerIds, ...goalWorkerIds]))

    const [workerRows, workshopRows] = await Promise.all([
      allIds.length > 0
        ? db.worker.findMany({
            where: { id: { in: allIds } },
            select: { id: true, fullName: true, jobTitle: true, isActive: true, workshopId: true },
          })
        : Promise.resolve([] as Array<{ id: string; fullName: string; jobTitle: string | null; isActive: boolean; workshopId: string | null }>),
      db.workshop.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ])

    // نیروهای فعال کارگاه‌های در دسترس (حتی بدون گزارش در این ماه) — برای تعیین هدف
    const scopeWorkshopIds = scope.isGlobal ? [] : scope.workshopIds
    const extraWorkers =
      scopeWorkshopIds.length > 0
        ? await db.worker.findMany({
            where: {
              isActive: true,
              workshopId: { in: scopeWorkshopIds },
              id: { notIn: allIds.length > 0 ? allIds : ['__none__'] },
            },
            select: { id: true, fullName: true, jobTitle: true, isActive: true, workshopId: true },
          })
        : []

    const rows = [...workerRows, ...extraWorkers]
    const goalByWorker = new Map(goals.map((g) => [g.workerId, g]))

    const workers = rows
      .map((w) => {
        const g = grouped.find((x) => x.workerId === w.id)
        const reportsCount = g?._count._all ?? 0
        const crewSum = g?._sum.crewCount ?? 0
        const goal = goalByWorker.get(w.id) ?? null
        const achievementPct =
          goal && goal.targetReports > 0 ? Math.min(100, Math.round((reportsCount / goal.targetReports) * 100)) : null
        return {
          workerId: w.id,
          name: w.fullName,
          jobTitle: w.jobTitle,
          isActive: w.isActive,
          workshopId: w.workshopId,
          workshopName: w.workshopId ? workshopRows.find((ws) => ws.id === w.workshopId)?.name ?? null : null,
          reportsCount,
          crewSum,
          lastReportAt: g?._max.reportDate?.toISOString() ?? null,
          goal: goal ? { id: goal.id, targetReports: goal.targetReports, note: goal.note, achievementPct } : null,
        }
      })
      .sort((a, b) => b.reportsCount - a.reportsCount || a.name.localeCompare(b.name, 'fa'))

    const [jy, jm] = gregorianToJalali(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
    const canManage = hasPermission(user.role, 'performance.manage')

    return ok({
      period,
      monthLabel: jalaliMonthLabel(jy, jm),
      workers,
      byWorkshop: byWorkshopGroup.map((b) => ({
        workshopId: b.workshopId,
        workshopName: workshopRows.find((w) => w.id === b.workshopId)?.name ?? '—',
        reportsCount: b._count._all,
        crewSum: b._sum.crewCount ?? 0,
      })),
      canManage,
    })
  },
  { permission: 'performance.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'performance' } }
)

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { createReportSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { dailyReportScopeFilter, tehranDayStart, tehranDayEnd } from '@/lib/daily'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/daily-reports — فهرست گزارش‌های روزانه ───────────────────────────

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)

    const url = req.nextUrl
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20') || 20))
    const status = url.searchParams.get('status')
    const projectId = url.searchParams.get('projectId')
    const workshopId = url.searchParams.get('workshopId')
    const reporterId = url.searchParams.get('reporterId')
    const date = url.searchParams.get('date')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const and: Prisma.DailyReportWhereInput[] = [dailyReportScopeFilter(scope, user.id)]

    if (status) {
      const list = status.split(',').map((s) => s.trim()).filter(Boolean)
      if (list.length > 0) and.push({ status: { in: list } })
    }
    if (projectId) and.push({ projectId })
    if (workshopId) and.push({ workshopId })
    // فیلتر گزارش‌دهنده فقط برای مدیران معنا دارد — سرپرست همیشه فقط گزارش‌های خودش را می‌بیند
    if (reporterId && scope.isGlobal) and.push({ reporterId })
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      and.push({ reportDate: { gte: tehranDayStart(date), lt: tehranDayEnd(date) } })
    }
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      and.push({ reportDate: { gte: tehranDayStart(from) } })
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      and.push({ reportDate: { lt: tehranDayEnd(to) } })
    }

    const where: Prisma.DailyReportWhereInput = { AND: and }

    const [total, reports] = await Promise.all([
      db.dailyReport.count({ where }),
      db.dailyReport.findMany({
        where,
        include: {
          project: { select: { name: true } },
          workshop: { select: { name: true } },
          reporter: { select: { id: true, fullName: true } },
        },
        orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return ok({
      reports: reports.map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        status: r.status,
        sourceType: r.sourceType,
        projectId: r.projectId,
        projectName: r.project.name,
        workshopId: r.workshopId,
        workshopName: r.workshop.name,
        reporterId: r.reporterId,
        reporterName: r.reporter.fullName,
        reportDate: r.reportDate.toISOString(),
        submittedAt: r.submittedAt?.toISOString() ?? null,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  },
  { permission: 'report.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-reports' } }
)

// ─────────────────────────── POST /api/v1/daily-reports — ایجاد گزارش (پیش‌نویس) ───────────────────────────

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const { projectId, workshopId, reportDate, title, content, clientRequestId } = body
    const scope = await getUserScope(user)

    // Idempotency — ضد گزارش تکراری در Offline Sync
    if (clientRequestId) {
      const existing = await db.dailyReport.findUnique({ where: { clientRequestId } })
      if (existing && existing.reporterId === user.id) {
        return ok({ reportId: existing.id, duplicate: true }, { status: 200 })
      }
    }

    // سرپرست فقط برای کارگاه خودش گزارش می‌سازد
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
      db.project.findFirst({ where: { id: projectId, isActive: true }, select: { id: true } }),
    ])
    if (!workshop) throw new ApiError(404, 'NOT_FOUND', 'کارگاه یافت نشد.')
    if (!project) throw new ApiError(404, 'NOT_FOUND', 'پروژه یافت نشد.')

    const report = await db.dailyReport.create({
      data: {
        projectId,
        workshopId,
        reporterId: user.id,
        reportDate: tehranDayStart(reportDate),
        title,
        content,
        sourceType: 'MANUAL',
        status: 'DRAFT',
        clientRequestId: clientRequestId ?? null,
      },
    })

    await writeAudit({
      user,
      action: 'CREATE_DAILY_REPORT',
      entityType: 'DailyReport',
      entityId: report.id,
      newValue: { title, projectId, workshopId, sourceType: 'MANUAL' },
      ip,
      userAgent,
    })

    return ok({ reportId: report.id, duplicate: false }, { status: 201 })
  },
  {
    permission: 'report.create',
    schema: createReportSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-reports-write' },
  }
)

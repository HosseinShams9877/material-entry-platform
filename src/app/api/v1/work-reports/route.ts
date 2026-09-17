import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, workshopOrProjectScopeFilter } from '@/lib/scope'
import { createWorkReportSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { tehranDayStart } from '@/lib/daily'
import { hasPermission } from '@/lib/permissions'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/work-reports — فهرست گزارش کار کارگران ───────────────────────────

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)

    const url = req.nextUrl
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20') || 20))
    const workerId = url.searchParams.get('workerId')
    const workshopId = url.searchParams.get('workshopId')
    const projectId = url.searchParams.get('projectId')
    const date = url.searchParams.get('date')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    // نیروی اجرایی فقط گزارش‌های خودش را می‌بیند (خوداظهاری — Scope اجباری)
    const mine = url.searchParams.get('mine') === '1' || user.role === 'FIELD_WORKER'
    const q = url.searchParams.get('q')?.trim()

    const and: Prisma.WorkReportWhereInput[] = [workshopOrProjectScopeFilter(scope) as Prisma.WorkReportWhereInput]

    if (workerId) and.push({ workerId })
    if (workshopId) and.push({ workshopId })
    if (projectId) and.push({ projectId })
    if (mine) and.push({ createdById: user.id })
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      and.push({ reportDate: { gte: tehranDayStart(date), lt: new Date(tehranDayStart(date).getTime() + 24 * 60 * 60 * 1000) } })
    }
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      and.push({ reportDate: { gte: tehranDayStart(from) } })
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      and.push({ reportDate: { lt: new Date(tehranDayStart(to).getTime() + 24 * 60 * 60 * 1000) } })
    }
    if (q) {
      and.push({ OR: [{ workerName: { contains: q } }, { content: { contains: q } }] })
    }

    const where: Prisma.WorkReportWhereInput = { AND: and }

    const [total, reports] = await Promise.all([
      db.workReport.count({ where }),
      db.workReport.findMany({
        where,
        include: {
          workshop: { select: { name: true } },
          project: { select: { name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return ok({
      reports: reports.map((r) => ({
        id: r.id,
        workshopId: r.workshopId,
        workshopName: r.workshop.name,
        projectId: r.projectId,
        projectName: r.project?.name ?? null,
        workerId: r.workerId,
        workerName: r.workerName,
        reportDate: r.reportDate.toISOString(),
        content: r.content,
        crewCount: r.crewCount,
        createdById: r.createdById,
        createdByName: r.createdBy.fullName,
        createdAt: r.createdAt.toISOString(),
        canDelete: hasPermission(user.role, 'workreport.delete'),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  },
  { permission: 'workreport.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'work-reports' } }
)

// ─────────────────────────── POST /api/v1/work-reports — ثبت گزارش کار کارگر ───────────────────────────

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    let { workshopId, projectId, workerId, workerName } = body
    const { reportDate, content, crewCount } = body
    const scope = await getUserScope(user)

    // خوداظهاری نیروی اجرایی — کارگاه/نام کارگر از حساب کاربر اجباری می‌شود
    // (کارگر نمی‌تواند به نام دیگری گزارش ثبت کند یا کارگاه دیگری را انتخاب کند)
    if (user.role === 'FIELD_WORKER') {
      const linked = await db.user.findUnique({
        where: { id: user.id },
        select: { workshopId: true, linkedWorker: { select: { id: true, fullName: true } } },
      })
      if (!linked?.linkedWorker || !linked.workshopId) {
        throw new ApiError(423, 'WORKER_LINK_MISSING', 'حساب شما به پروفایل کارگر متصل نیست — با مدیر سیستم تماس بگیرید.')
      }
      workshopId = linked.workshopId
      workerId = linked.linkedWorker.id
      workerName = linked.linkedWorker.fullName
      projectId = null
    }

    if (!scope.isGlobal && !scope.workshopIds.includes(workshopId)) {
      throw new ApiError(403, 'FORBIDDEN', 'به این کارگاه دسترسی ندارید.')
    }
    if (projectId) {
      const projectBelongs = await db.project.findFirst({
        where: { id: projectId, workshopId },
        select: { id: true },
      })
      if (!projectBelongs) throw new ApiError(422, 'INVALID_PROJECT', 'پروژهٔ انتخاب‌شده به این کارگاه تعلق ندارد.')
    }
    if (workerId) {
      const workerBelongs = await db.worker.findFirst({
        where: { id: workerId, workshopId },
        select: { id: true },
      })
      if (!workerBelongs) throw new ApiError(422, 'INVALID_WORKER', 'کارگر انتخاب‌شده به این کارگاه تعلق ندارد.')
    }

    const created = await db.workReport.create({
      data: {
        workshopId,
        projectId: projectId ?? null,
        workerId: workerId ?? null,
        workerName,
        reportDate: tehranDayStart(reportDate),
        content,
        crewCount: crewCount ?? null,
        createdById: user.id,
      },
    })

    await writeAudit({
      user,
      action: 'CREATE_WORK_REPORT',
      entityType: 'WorkReport',
      entityId: created.id,
      newValue: { workerName, reportDate, workshopId, projectId },
      ip,
      userAgent,
    })

    return ok({ reportId: created.id }, { status: 201 })
  },
  {
    permission: 'workreport.create',
    schema: createWorkReportSchema,
    rateLimit: { limit: 60, windowMs: 60_000, scope: 'work-reports-write' },
  }
)

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { projectManagerIds } from '@/lib/daily'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/daily-reports/[id]/submit — ارسال نهایی گزارش ───────────────────────────

export const POST = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const report = await db.dailyReport.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true, workshopId: true, reporterId: true, projectId: true },
    })
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'گزارش یافت نشد.')

    const scope = await getUserScope(user)
    const isOwner = report.reporterId === user.id
    const allowed = scope.isGlobal || (isOwner && scope.workshopIds.includes(report.workshopId))
    if (!allowed) throw new ApiError(404, 'NOT_FOUND', 'گزارش یافت نشد.')

    if (report.status !== 'DRAFT') {
      throw new ApiError(423, 'REPORT_NOT_SUBMITTABLE', 'این گزارش قبلاً ارسال شده است.')
    }

    const now = new Date()
    await db.dailyReport.update({
      where: { id: report.id },
      data: { status: 'SUBMITTED', submittedAt: now },
    })

    await writeAudit({
      user,
      action: 'SUBMIT_DAILY_REPORT',
      entityType: 'DailyReport',
      entityId: report.id,
      oldValue: { status: 'DRAFT' },
      newValue: { status: 'SUBMITTED', submittedAt: now.toISOString() },
      ip,
      userAgent,
    })

    // اعلان به مدیران کارگاه + مدیران پروژهٔ دارای دسترسی
    const workshopManagers = await db.user.findMany({
      where: {
        isActive: true,
        role: 'WORKSHOP_MANAGER',
        OR: [{ workshopId: report.workshopId }, { userWorkshops: { some: { workshopId: report.workshopId } } }],
      },
      select: { id: true },
    })
    const pmIds = await projectManagerIds(report.projectId)
    await notifyUsers({
      userIds: [...workshopManagers.map((m) => m.id), ...pmIds],
      type: 'REPORT_SUBMITTED',
      title: 'گزارش روزانه جدید',
      body: `«${user.fullName}» گزارش روزانهٔ «${report.title}» را ارسال کرد.`,
      entityId: report.id,
      entityType: 'DailyReport',
    })

    return ok({ submitted: true, submittedAt: now.toISOString() })
  },
  { permission: 'report.submit', rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-reports-write' } }
)

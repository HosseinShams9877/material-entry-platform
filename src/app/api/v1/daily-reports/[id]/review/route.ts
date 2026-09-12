import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { reviewReportSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/daily-reports/[id]/review — بررسی/مشاهدهٔ گزارش ───────────────────────────
// مدیر کارگاه یا مدیر پروژه؛ SUBMITTED → REVIEWED + اعلان به گزارش‌دهنده

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const report = await db.dailyReport.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true, workshopId: true, projectId: true, reporterId: true },
    })
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'گزارش یافت نشد.')

    const scope = await getUserScope(user)
    const allowed =
      scope.isGlobal ||
      scope.workshopIds.includes(report.workshopId) ||
      (scope.projectIds !== null && scope.projectIds.includes(report.projectId))
    if (!allowed) throw new ApiError(404, 'NOT_FOUND', 'گزارش یافت نشد.')

    if (report.status !== 'SUBMITTED') {
      throw new ApiError(423, 'REPORT_NOT_REVIEWABLE', 'فقط گزارش ارسال‌شده قابل بررسی است.')
    }

    const now = new Date()
    await db.dailyReport.update({
      where: { id: report.id },
      data: { status: 'REVIEWED', reviewedById: user.id, reviewedAt: now, reviewNote: body.note ?? null },
    })

    await writeAudit({
      user,
      action: 'REVIEW_DAILY_REPORT',
      entityType: 'DailyReport',
      entityId: report.id,
      oldValue: { status: 'SUBMITTED' },
      newValue: { status: 'REVIEWED', reviewedAt: now.toISOString(), note: body.note ?? null },
      ip,
      userAgent,
    })

    await notifyUsers({
      userIds: [report.reporterId],
      type: 'REPORT_REVIEWED',
      title: 'گزارش شما بررسی شد',
      body: `گزارش روزانهٔ «${report.title}» توسط ${user.fullName} بررسی شد.`,
      entityId: report.id,
      entityType: 'DailyReport',
    })

    return ok({ reviewed: true, reviewedAt: now.toISOString() })
  },
  {
    permission: 'report.review',
    schema: reviewReportSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-reports-write' },
  }
)

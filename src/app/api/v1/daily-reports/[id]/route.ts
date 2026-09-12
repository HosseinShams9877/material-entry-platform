import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { updateReportSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { canAccessReport, reportDetailInclude, tehranDayStart } from '@/lib/daily'
import { makeSignedDailyAudioUrl } from '@/lib/signed-url'

// ─────────────────────────── GET /api/v1/daily-reports/[id] — جزئیات گزارش ───────────────────────────

export const GET = apiHandler(
  async ({ params, user }) => {
    const report = await db.dailyReport.findUnique({
      where: { id: params.id },
      include: reportDetailInclude,
    })
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'گزارش یافت نشد.')
    if (!(await canAccessReport(user, report))) throw new ApiError(404, 'NOT_FOUND', 'گزارش یافت نشد.')

    const scope = await getUserScope(user)
    const isOwner = report.reporterId === user.id
    const canEdit =
      hasReportEdit(user.role) && isOwner && report.status === 'DRAFT' && (scope.isGlobal || scope.workshopIds.includes(report.workshopId))
    const canSubmit =
      hasReportSubmit(user.role) && isOwner && report.status === 'DRAFT' && (scope.isGlobal || scope.workshopIds.includes(report.workshopId))
    const canReview = hasReportReview(user.role) && report.status === 'SUBMITTED'

    return ok({
      report: {
        id: report.id,
        title: report.title,
        content: report.content,
        status: report.status,
        sourceType: report.sourceType,
        transcript: report.transcript,
        projectId: report.projectId,
        projectName: report.project.name,
        workshopId: report.workshopId,
        workshopName: report.workshop.name,
        reporterId: report.reporterId,
        reporterName: report.reporter.fullName,
        reportDate: report.reportDate.toISOString(),
        submittedAt: report.submittedAt?.toISOString() ?? null,
        reviewedAt: report.reviewedAt?.toISOString() ?? null,
        reviewedByName: report.reviewedBy?.fullName ?? null,
        reviewNote: report.reviewNote,
        audio: report.audio
          ? {
              id: report.audio.id,
              fileName: report.audio.fileName,
              mimeType: report.audio.mimeType,
              size: report.audio.size,
              transcribeStatus: report.audio.transcribeStatus,
              audioUrl: makeSignedDailyAudioUrl(report.audio.id),
            }
          : null,
        createdAt: report.createdAt.toISOString(),
        canEdit,
        canSubmit,
        canReview,
      },
    })
  },
  { permission: 'report.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-reports' } }
)

function hasReportEdit(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'WORKSHOP_SUPERVISOR'
}
function hasReportSubmit(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'WORKSHOP_SUPERVISOR'
}
function hasReportReview(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'WORKSHOP_MANAGER' || role === 'PROJECT_MANAGER'
}

// ─────────────────────────── PATCH /api/v1/daily-reports/[id] — ویرایش پیش‌نویس گزارش ───────────────────────────

export const PATCH = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const existing = await db.dailyReport.findUnique({ where: { id: params.id } })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'گزارش یافت نشد.')

    const scope = await getUserScope(user)
    const isOwner = existing.reporterId === user.id
    const allowed = scope.isGlobal || (isOwner && scope.workshopIds.includes(existing.workshopId))
    if (!allowed) throw new ApiError(404, 'NOT_FOUND', 'گزارش یافت نشد.')

    if (existing.status !== 'DRAFT') {
      throw new ApiError(423, 'REPORT_NOT_EDITABLE', 'فقط پیش‌نویس گزارش قابل ویرایش است.')
    }

    await db.dailyReport.update({
      where: { id: existing.id },
      data: {
        title: body.title !== undefined ? body.title : undefined,
        content: body.content !== undefined ? body.content : undefined,
        transcript: body.transcript !== undefined ? body.transcript : undefined,
        reportDate: body.reportDate !== undefined ? tehranDayStart(body.reportDate) : undefined,
        projectId: body.projectId !== undefined ? body.projectId : undefined,
        workshopId: body.workshopId !== undefined ? body.workshopId : undefined,
      },
    })

    await writeAudit({
      user,
      action: 'UPDATE_DAILY_REPORT',
      entityType: 'DailyReport',
      entityId: existing.id,
      oldValue: { title: existing.title, status: existing.status },
      newValue: { title: body.title ?? existing.title },
      ip,
      userAgent,
    })

    return ok({ updated: true })
  },
  {
    permission: 'report.edit',
    schema: updateReportSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-reports-write' },
  }
)

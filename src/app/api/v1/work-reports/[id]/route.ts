import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, canAccessWorkshopRecord } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

// ─────────────────────────── DELETE /api/v1/work-reports/[id] — حذف گزارش کار ───────────────────────────
// مدیران با مجوز workreport.delete گزارش کارگاه را حذف می‌کنند؛ نیروی اجرایی حق حذف ندارد
// (خوداظهاری یک‌طرفه است — اصلاح با ثبت گزارش جدید، نه پاک‌کردن رد پای کار).

export const DELETE = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const existing = await db.workReport.findUnique({ where: { id: params.id } })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'گزارش کار یافت نشد.')
    if (!hasPermission(user.role, 'workreport.delete')) {
      throw new ApiError(403, 'FORBIDDEN', 'حذف گزارش کار در دسترس شما نیست.')
    }

    const scope = await getUserScope(user)
    if (!canAccessWorkshopRecord(scope, existing, user.id)) {
      throw new ApiError(404, 'NOT_FOUND', 'گزارش کار یافت نشد.')
    }

    await db.workReport.delete({ where: { id: existing.id } })

    await writeAudit({
      user,
      action: 'DELETE_WORK_REPORT',
      entityType: 'WorkReport',
      entityId: existing.id,
      oldValue: { workerName: existing.workerName, reportDate: existing.reportDate.toISOString() },
      ip,
      userAgent,
    })

    return ok({ deleted: true })
  },
  { permission: 'workreport.view', rateLimit: { limit: 30, windowMs: 60_000, scope: 'work-reports-write' } }
)

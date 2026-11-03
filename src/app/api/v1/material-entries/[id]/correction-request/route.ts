import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'
import { hasPermission } from '@/lib/permissions'
import { canManageEntry } from '@/lib/entry-rules'
import { createCorrectionRequest } from '@/lib/workflow'
import { correctionRequestSchema } from '@/lib/validate'

/** درخواست اصلاح توسط سرپرست پس از قفل شدن رکورد */
export const POST = apiHandler(
  async ({ user, body, params, ip, userAgent }) => {
    const { id } = params
    const { reason } = body

    const entry = await db.materialEntry.findUnique({ where: { id } })
    if (!entry || !(await canAccessEntry(user, entry))) {
      throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
    }
    if (!canManageEntry(entry, user)) {
      throw new ApiError(403, 'FORBIDDEN', 'فقط ثبت‌کننده، انباردار یا مدیر پروژه می‌تواند درخواست اصلاح بدهد.')
    }
    if (!hasPermission(user.role, 'entry.correction.request')) {
      throw new ApiError(403, 'FORBIDDEN', 'شما اجازه ارسال درخواست اصلاح را ندارید.')
    }

    const cr = await createCorrectionRequest(entry, user, reason, ip, userAgent)
    return ok({ id: cr.id, status: cr.status }, { status: 201 })
  },
  { permission: 'entry.correction.request', schema: correctionRequestSchema }
)

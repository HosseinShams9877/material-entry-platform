import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { hasPermission } from '@/lib/permissions'
import { reviewCorrectionRequest } from '@/lib/workflow'
import { reviewCorrectionSchema } from '@/lib/validate'

/** بررسی درخواست اصلاح توسط مدیر (تأیید → ایجاد نسخه جدید) */
export const POST = apiHandler(
  async ({ user, body, params, ip, userAgent }) => {
    const { id } = params
    const { decision, responseNote } = body

    if (!hasPermission(user.role, 'entry.review')) {
      throw new ApiError(403, 'FORBIDDEN', 'شما اجازه بررسی درخواست اصلاح را ندارید.')
    }
    const cr = await db.correctionRequest.findUnique({ where: { id }, include: { entry: { select: { workshopId: true } } } })
    if (!cr) throw new ApiError(404, 'NOT_FOUND', 'درخواست اصلاح یافت نشد.')
    const scope = await getUserScope(user)
    if (!scope.isGlobal && !scope.workshopIds.includes(cr.entry.workshopId)) {
      throw new ApiError(404, 'NOT_FOUND', 'درخواست اصلاح یافت نشد.')
    }

    const result = await reviewCorrectionRequest(id, user, decision, responseNote ?? null, ip, userAgent)
    return ok({ id: result.correction.id, status: result.correction.status })
  },
  { permission: 'entry.review', schema: reviewCorrectionSchema }
)

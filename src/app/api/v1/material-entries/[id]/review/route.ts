import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canReviewEntry } from '@/lib/scope'
import { reviewEntry } from '@/lib/workflow'
import { reviewSchema } from '@/lib/validate'

/** بررسی مدیر: APPROVE / REJECT / REQUEST_CORRECTION */
export const POST = apiHandler(
  async ({ user, body, params, ip, userAgent }) => {
    const { id } = params
    const { action, reason } = body

    const entry = await db.materialEntry.findUnique({ where: { id } })
    if (!entry || !(await canReviewEntry(user, entry))) {
      throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
    }

    const updated = await reviewEntry(entry, user, action, reason ?? null, ip, userAgent)
    return ok({ id: updated.id, status: updated.status })
  },
  { permission: 'entry.review', schema: reviewSchema }
)

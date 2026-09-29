import { z } from 'zod'
import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'
import { startTechReview, completeTechReview } from '@/lib/workflow'

const techReviewSchema = z.object({
  action: z.enum(['START', 'COMPLETE']),
  note: z.string().max(2000).optional().nullable(),
})

/** بررسی فنی: START (شروع) / COMPLETE (پایان با نظر ناظر) — مجوز: entry.techReview */
export const POST = apiHandler(
  async ({ user, body, params, ip, userAgent }) => {
    const { id } = params
    const { action, note } = body

    const entry = await db.materialEntry.findUnique({ where: { id } })
    if (!entry || !(await canAccessEntry(user, entry))) {
      throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
    }

    const updated =
      action === 'START'
        ? await startTechReview(entry, user, ip, userAgent)
        : await completeTechReview(entry, user, note ?? null, ip, userAgent)
    return ok({ id: updated.id, status: updated.status })
  },
  {
    permission: 'entry.techReview',
    schema: techReviewSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'entry-stage' },
  }
)

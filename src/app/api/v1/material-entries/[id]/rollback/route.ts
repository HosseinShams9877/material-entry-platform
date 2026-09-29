import { z } from 'zod'
import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'
import { rollbackStage } from '@/lib/workflow'

const rollbackSchema = z.object({ reason: z.string().max(2000).optional().nullable() })

/** برگشت مرحله — مجوز: entry.rollback (مدیر پروژه/کارگاه/ادمین)؛ تاریخچه کامل ثبت می‌شود */
export const POST = apiHandler(
  async ({ user, body, params, ip, userAgent }) => {
    const { id } = params
    const entry = await db.materialEntry.findUnique({ where: { id } })
    if (!entry || !(await canAccessEntry(user, entry))) {
      throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
    }
    const updated = await rollbackStage(entry, user, body.reason ?? null, ip, userAgent)
    return ok({ id: updated.id, status: updated.status })
  },
  {
    permission: 'entry.rollback',
    schema: rollbackSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'entry-stage' },
  }
)

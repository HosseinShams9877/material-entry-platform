import { z } from 'zod'
import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'
import { warehouseConfirm } from '@/lib/workflow'

const noteSchema = z.object({ note: z.string().max(2000).optional().nullable() })

/** تأیید انبار — مجوز: entry.warehouse (انباردار) */
export const POST = apiHandler(
  async ({ user, body, params, ip, userAgent }) => {
    const { id } = params
    const entry = await db.materialEntry.findUnique({ where: { id } })
    if (!entry || !(await canAccessEntry(user, entry))) {
      throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
    }
    const updated = await warehouseConfirm(entry, user, body.note ?? null, ip, userAgent)
    return ok({ id: updated.id, status: updated.status })
  },
  {
    permission: 'entry.warehouse',
    schema: noteSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'entry-stage' },
  }
)

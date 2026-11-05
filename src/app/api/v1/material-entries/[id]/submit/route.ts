import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'
import { hasPermission } from '@/lib/permissions'
import { canManageEntry } from '@/lib/entry-rules'
import { submitEntry, assertOutStockAvailable } from '@/lib/workflow'

export const POST = apiHandler(
  async ({ user, params, ip, userAgent }) => {
    const { id } = params
    const entry = await db.materialEntry.findUnique({ where: { id } })
    if (!entry || !(await canAccessEntry(user, entry))) {
      throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
    }
    if (!canManageEntry(entry, user)) {
      throw new ApiError(403, 'FORBIDDEN', 'فقط ثبت‌کننده، انباردار یا مدیر پروژه می‌تواند آن را ارسال کند.')
    }
    if (!hasPermission(user.role, 'entry.submit')) {
      throw new ApiError(403, 'FORBIDDEN', 'شما اجازه ارسال این ثبت را ندارید.')
    }
    // Item ۱ — خروج با موجودی ناکافی نباید ارسال شود (بررسی سمت سرور)
    await assertOutStockAvailable(entry.id)
    const updated = await submitEntry(entry, user, ip, userAgent)
    return ok({ id: updated.id, status: updated.status, submittedAt: updated.submittedAt, editDeadline: updated.editDeadline })
  },
  { permission: 'entry.submit' }
)

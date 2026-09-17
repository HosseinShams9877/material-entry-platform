import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { removeStoredFile } from '@/lib/upload'
import type { NextRequest } from 'next/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ user, params }) => {
      const { id } = params
      const attachment = await db.attachment.findUnique({
        where: { id },
        include: { entry: { select: { workshopId: true, supervisorId: true } } },
      })
      if (!attachment || !(await canAccessEntry(user, attachment.entry))) {
        throw new ApiError(404, 'NOT_FOUND', 'مدرک یافت نشد.')
      }
      return ok({
        id: attachment.id,
        kind: attachment.kind,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
      })
    },
    { rateLimit: { limit: 60, windowMs: 60_000, scope: 'attachment-get' } }
  )(req, ctx)
}

export async function DELETE(req: NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ user, params, ip, userAgent }) => {
      const { id } = params
      const attachment = await db.attachment.findUnique({ where: { id }, include: { entry: true } })
      if (!attachment || !(await canAccessEntry(user, attachment.entry))) {
        throw new ApiError(404, 'NOT_FOUND', 'مدرک یافت نشد.')
      }
      if (attachment.entry.supervisorId !== user.id && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
        throw new ApiError(403, 'FORBIDDEN', 'فقط سرپرستِ ثبت‌کننده می‌تواند مدرک را حذف کند.')
      }
      // حذف رکورد + حذف فایل فیزیکی (Hard Delete عمدی است؛ Audit می‌ماند)
      await db.attachment.delete({ where: { id } })
      await removeStoredFile(attachment.storagePath)
      await writeAudit({
        user,
        action: 'DELETE_ATTACHMENT',
        entityType: 'Attachment',
        entityId: id,
        oldValue: { entryId: attachment.entryId, fileName: attachment.fileName },
        ip,
        userAgent,
      })
      return ok({ deleted: true })
    },
    { permission: 'entry.edit', rateLimit: { limit: 30, windowMs: 60_000, scope: 'attachment-delete' } }
  )(req, ctx)
}

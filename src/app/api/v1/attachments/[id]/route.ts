import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { resolveAttachmentAccess } from '@/lib/scope'
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
        select: { id: true, entityType: true, entityId: true, entryId: true, kind: true, fileName: true, mimeType: true, size: true, createdAt: true },
      })
      if (!attachment) throw new ApiError(404, 'NOT_FOUND', 'مدرک یافت نشد.')
      const entityId = attachment.entityId ?? attachment.entryId ?? ''
      const access = await resolveAttachmentAccess(user, attachment.entityType, entityId)
      if (!access.exists || !access.canView) {
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
      const attachment = await db.attachment.findUnique({ where: { id } })
      if (!attachment) throw new ApiError(404, 'NOT_FOUND', 'مدرک یافت نشد.')
      const entityId = attachment.entityId ?? attachment.entryId ?? ''
      const access = await resolveAttachmentAccess(user, attachment.entityType, entityId)
      if (!access.exists || !access.canView) {
        throw new ApiError(404, 'NOT_FOUND', 'مدرک یافت نشد.')
      }
      if (!access.canManage) {
        throw new ApiError(403, 'FORBIDDEN', 'اجازهٔ حذف این مدرک را ندارید.')
      }
      // حذف رکورد + حذف فایل فیزیکی (Hard Delete عمدی است؛ Audit می‌ماند)
      await db.attachment.delete({ where: { id } })
      await removeStoredFile(attachment.storagePath)
      await writeAudit({
        user,
        action: 'DELETE_ATTACHMENT',
        entityType: 'Attachment',
        entityId: id,
        oldValue: { entityType: attachment.entityType, entityId, fileName: attachment.fileName },
        ip,
        userAgent,
      })
      return ok({ deleted: true })
    },
    { rateLimit: { limit: 30, windowMs: 60_000, scope: 'attachment-delete' } }
  )(req, ctx)
}

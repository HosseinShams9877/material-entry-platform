import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { makeSignedFileUrl } from '@/lib/signed-url'
import { validateAndProcess, storeAttachmentFile, removeStoredFile, UploadValidationError, MAX_UPLOAD_SIZE } from '@/lib/upload'
import { activeStorageProvider } from '@/lib/storage'
import { logger, safeErrorMeta } from '@/lib/logger'

/**
 * نسخه‌گذاری مدرک — بارگذاری نسخهٔ جدید یک فایل موجود:
 * رکورد قبلی نگه داشته می‌شود (replacedById به نسخهٔ جدید اشاره می‌کند)؛
 * تاریخچهٔ کامل نسخه‌ها قابل مشاهده و دانلود است.
 */
export const POST = apiHandler(
  async ({ req, user, params, ip, userAgent }) => {
    const { id: parentId } = await params
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ApiError(422, 'INVALID_UPLOAD', 'فایل ارسال نشده است.')
    }
    const declaredLength = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_SIZE + 64 * 1024) {
      throw new ApiError(413, 'FILE_TOO_LARGE', 'حجم فایل بیش از ۱۰ مگابایت است.')
    }

    const parent = await db.attachment.findUnique({ where: { id: parentId }, include: { entry: true } })
    if (!parent || !(await canAccessEntry(user, parent.entry))) {
      throw new ApiError(404, 'NOT_FOUND', 'مدرک یافت نشد یا به آن دسترسی ندارید.')
    }
    if (parent.entry.supervisorId !== user.id && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'فقط سرپرستِ ثبت‌کننده می‌تواند نسخهٔ جدید بارگذاری کند.')
    }
    if (parent.replacedById) {
      throw new ApiError(409, 'SUPERSEDED', 'این نسخه قدیمی است؛ فقط آخرین نسخه قابل جایگزینی است.')
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw new ApiError(413, 'FILE_TOO_LARGE', 'بدنهٔ درخواست بیش از حد مجاز است یا فرم نامعتبر است.')
    }
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError(422, 'INVALID_UPLOAD', 'فایل ارسال نشده است.')

    let processed
    try {
      processed = await validateAndProcess(file)
    } catch (err) {
      if (err instanceof UploadValidationError) throw new ApiError(err.status, err.code, err.faMessage)
      logger.error('upload', 'unexpected validation failure', safeErrorMeta(err))
      throw new ApiError(422, 'INVALID_UPLOAD', 'فایل قابل پذیرش نیست.')
    }

    const stored = await storeAttachmentFile(processed, file.name || parent.fileName)

    try {
      const latest = await db.attachment.findFirst({
        where: { entryId: parent.entryId, kind: parent.kind },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const nextVersion = Math.max(parent.version, latest?.version ?? 1) + 1

      const created = await db.attachment.create({
        data: {
          entryId: parent.entryId,
          kind: parent.kind,
          fileName: stored.fileName,
          mimeType: processed.mime,
          size: stored.size,
          storagePath: stored.storagePath,
          version: nextVersion,
          storageProvider: activeStorageProvider(),
          uploadedById: user.id,
        },
      })
      await db.attachment.update({ where: { id: parent.id }, data: { replacedById: created.id } })

      await writeAudit({
        user,
        action: 'UPLOAD_ATTACHMENT',
        entityType: 'Attachment',
        entityId: created.id,
        newValue: { entryId: parent.entryId, kind: parent.kind, version: nextVersion, replaces: parent.id, size: stored.size },
        ip,
        userAgent,
      })
      return ok(
        {
          id: created.id,
          version: nextVersion,
          replaces: parent.id,
          fileName: created.fileName,
          size: created.size,
          url: makeSignedFileUrl(created.id),
        },
        { status: 201 }
      )
    } catch (err) {
      await removeStoredFile(stored.storagePath)
      logger.error('upload', 'db insert failed; stored file rolled back', safeErrorMeta(err))
      throw new ApiError(500, 'INTERNAL_ERROR', 'ذخیرهٔ نسخهٔ جدید ناموفق بود.')
    }
  },
  { permission: 'entry.edit', rateLimit: { limit: 20, windowMs: 60_000, scope: 'upload' } }
)

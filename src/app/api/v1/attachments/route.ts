import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { resolveAttachmentAccess, type AttachmentEntity } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { makeSignedFileUrl } from '@/lib/signed-url'
import { validateAndProcess, storeAttachmentFile, removeStoredFile, UploadValidationError, MAX_UPLOAD_SIZE } from '@/lib/upload'
import { activeStorageProvider } from '@/lib/storage'
import { logger, safeErrorMeta } from '@/lib/logger'

const ATTACHMENT_KINDS = ['INVOICE', 'WAYBILL', 'RECEIPT', 'OTHER', 'PHOTO'] as const
const ENTITY_TYPES: AttachmentEntity[] = ['ENTRY', 'STATEMENT', 'WORK_REPORT']

function serialize(a: {
  id: string
  kind: string
  fileName: string
  mimeType: string
  size: number
  createdAt: Date
}) {
  return {
    id: a.id,
    kind: a.kind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    url: makeSignedFileUrl(a.id),
    createdAt: a.createdAt,
  }
}

export const POST = apiHandler(
  async ({ req, user, ip, userAgent }) => {
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ApiError(422, 'INVALID_UPLOAD', 'فایل ارسال نشده است.')
    }

    // گارد زودهنگام حجم — قبل از Parse بدنه (بدنهٔ حجیم هرگز وارد حافظه نمی‌شود)
    const declaredLength = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_SIZE + 64 * 1024) {
      throw new ApiError(413, 'FILE_TOO_LARGE', 'حجم فایل بیش از ۱۰ مگابایت است.')
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw new ApiError(413, 'FILE_TOO_LARGE', 'بدنهٔ درخواست بیش از حد مجاز است یا فرم نامعتبر است.')
    }
    const file = form.get('file')
    const kind = String(form.get('kind') ?? 'OTHER')
    // entityType جدید — با سازگاری کامل با کلاینت‌های قدیمی (entryId = ENTRY)
    const rawType = String(form.get('entityType') ?? 'ENTRY').toUpperCase()
    const entityType = (ENTITY_TYPES.includes(rawType as AttachmentEntity) ? rawType : 'ENTRY') as AttachmentEntity
    const entityId = String(form.get('entityId') ?? form.get('entryId') ?? '')

    if (!(file instanceof File)) throw new ApiError(422, 'INVALID_UPLOAD', 'فایل ارسال نشده است.')
    if (!ATTACHMENT_KINDS.includes(kind as (typeof ATTACHMENT_KINDS)[number])) {
      throw new ApiError(422, 'INVALID_KIND', 'نوع مدرک معتبر نیست.')
    }

    // دسترسی یکپارچهٔ چندموجودیتی — مشاهده/مدیریت بر اساس نوع موجودیت
    const access = await resolveAttachmentAccess(user, entityType, entityId)
    if (!access.exists || !access.canView) {
      throw new ApiError(404, 'NOT_FOUND', 'موجودیت مربوطه یافت نشد یا به آن دسترسی ندارید.')
    }
    if (!access.canManage) {
      throw new ApiError(403, 'FORBIDDEN', 'اجازهٔ افزودن مدرک به این مورد را ندارید.')
    }

    // اعتبارسنجی چندلایه: حجم + MIME اعلانی + پسوند + Magic Bytes + بازپردازش sharp
    let processed
    try {
      processed = await validateAndProcess(file)
    } catch (err) {
      if (err instanceof UploadValidationError) {
        throw new ApiError(err.status, err.code, err.faMessage)
      }
      logger.error('upload', 'unexpected validation failure', safeErrorMeta(err))
      throw new ApiError(422, 'INVALID_UPLOAD', 'فایل قابل پذیرش نیست.')
    }

    // ذخیرهٔ فایل با نام سرساخت داخل UPLOAD_DIR (خارج از public)
    const stored = await storeAttachmentFile(processed, file.name || '')

    // درج رکورد — در صورت شکست، فایل فیزیکی حذف می‌شود (بدون فایل یتیم)
    let attachment
    try {
      attachment = await db.attachment.create({
        data: {
          entryId: entityType === 'ENTRY' ? entityId : null,
          entityType,
          entityId,
          kind,
          fileName: stored.fileName,
          mimeType: processed.mime,
          size: stored.size,
          storagePath: stored.storagePath,
          storageProvider: activeStorageProvider(),
          uploadedById: user.id,
        },
      })
    } catch (err) {
      await removeStoredFile(stored.storagePath)
      logger.error('upload', 'db insert failed; stored file rolled back', safeErrorMeta(err))
      throw new ApiError(500, 'INTERNAL_ERROR', 'ذخیرهٔ مدرک ناموفق بود. لطفاً دوباره تلاش کنید.')
    }

    await writeAudit({
      user,
      action: 'UPLOAD_ATTACHMENT',
      entityType: 'Attachment',
      entityId: attachment.id,
      newValue: { entityType, entityId, kind, fileName: attachment.fileName, size: attachment.size },
      ip,
      userAgent,
    })

    return ok(
      {
        id: attachment.id,
        kind: attachment.kind,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url: makeSignedFileUrl(attachment.id),
        createdAt: attachment.createdAt,
      },
      { status: 201 }
    )
  },
  { rateLimit: { limit: 30, windowMs: 60_000, scope: 'upload' } }
)

export const GET = apiHandler(
  async ({ req, user }) => {
    const url = req.nextUrl
    const rawType = (url.searchParams.get('entityType') ?? 'ENTRY').toUpperCase()
    const entityType = (ENTITY_TYPES.includes(rawType as AttachmentEntity) ? rawType : 'ENTRY') as AttachmentEntity
    const entityId = url.searchParams.get('entityId') ?? url.searchParams.get('entryId') ?? ''

    const access = await resolveAttachmentAccess(user, entityType, entityId)
    if (!access.exists || !access.canView) {
      throw new ApiError(404, 'NOT_FOUND', 'موجودیت مربوطه یافت نشد یا به آن دسترسی ندارید.')
    }

    const attachments = await db.attachment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    })
    return ok({ attachments: attachments.map(serialize) })
  },
  { rateLimit: { limit: 60, windowMs: 60_000, scope: 'attachment-list' } }
)

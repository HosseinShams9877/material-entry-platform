import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { validateAndProcess, storeAttachmentFile, removeStoredFile, UploadValidationError, MAX_UPLOAD_SIZE } from '@/lib/upload'
import { activeStorageProvider } from '@/lib/storage'
import { logger, safeErrorMeta } from '@/lib/logger'

// ─────────────────────────── POST /api/v1/purchase-requests/[id]/invoice — تصویر فاکتور خرید ───────────────────────────
// فاکتور (تصویر JPG/PNG/WebP یا PDF) با Magic Bytes + بازپردازش sharp ذخیره می‌شود.
// بارگذاری مجدد، فایل قبلی را جایگزین می‌کند (نسخهٔ قبلی حذف می‌شود — بایگانی ساده).

export const POST = apiHandler(
  async ({ req, params, user, ip, userAgent }) => {
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ApiError(422, 'INVALID_UPLOAD', 'فایل ارسال نشده است.')
    }

    // گارد زودهنگام حجم — قبل از Parse بدنه
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
    if (!(file instanceof File)) throw new ApiError(422, 'INVALID_UPLOAD', 'فایل ارسال نشده است.')

    const request = await db.purchaseRequest.findUnique({ where: { id: params.id } })
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const scope = await getUserScope(user)
    const canAct =
      scope.isGlobal ||
      scope.workshopIds.includes(request.workshopId) ||
      (request.projectId && scope.projectIds !== null && scope.projectIds.includes(request.projectId))
    if (!canAct) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')
    if (request.status !== 'ORDERED' && request.status !== 'RECEIVED') {
      throw new ApiError(423, 'PURCHASE_NOT_ORDERED', 'فاکتور فقط پس از ثبت خرید قابل بارگذاری است.')
    }

    let processed
    try {
      processed = await validateAndProcess(file)
    } catch (err) {
      if (err instanceof UploadValidationError) {
        throw new ApiError(err.status, err.code, err.faMessage)
      }
      logger.error('purchase-invoice', 'unexpected validation failure', safeErrorMeta(err))
      throw new ApiError(422, 'INVALID_UPLOAD', 'فایل قابل پذیرش نیست.')
    }

    const stored = await storeAttachmentFile(processed, file.name || 'invoice')

    try {
      const previousPath = request.invoicePath
      await db.purchaseRequest.update({
        where: { id: request.id },
        data: {
          invoicePath: stored.storagePath,
          invoiceFileName: stored.fileName,
          invoiceMimeType: processed.mime,
          invoiceSize: stored.size,
          invoiceProvider: activeStorageProvider(),
        },
      })
      if (previousPath) await removeStoredFile(previousPath)

      await writeAudit({
        user,
        action: 'UPLOAD_PURCHASE_INVOICE',
        entityType: 'PurchaseRequest',
        entityId: request.id,
        newValue: { fileName: stored.fileName, mimeType: processed.mime, size: stored.size, replaced: Boolean(previousPath) },
        ip,
        userAgent,
      })
      return ok({ uploaded: true, fileName: stored.fileName, mimeType: processed.mime }, { status: 201 })
    } catch (err) {
      await removeStoredFile(stored.storagePath)
      logger.error('purchase-invoice', 'db update failed; stored file rolled back', safeErrorMeta(err))
      throw new ApiError(500, 'UPLOAD_FAILED', 'ذخیرهٔ فاکتور انجام نشد. دوباره تلاش کنید.')
    }
  },
  { permission: 'purchase.order', rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' } }
)

// ─────────────────────────── DELETE /api/v1/purchase-requests/[id]/invoice — حذف فاکتور ───────────────────────────

export const DELETE = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const request = await db.purchaseRequest.findUnique({ where: { id: params.id } })
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const scope = await getUserScope(user)
    const canAct =
      scope.isGlobal ||
      scope.workshopIds.includes(request.workshopId) ||
      (request.projectId && scope.projectIds !== null && scope.projectIds.includes(request.projectId))
    if (!canAct) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')
    if (!request.invoicePath) throw new ApiError(404, 'NOT_FOUND', 'فاکتوری ثبت نشده است.')

    const previousPath = request.invoicePath
    await db.purchaseRequest.update({
      where: { id: request.id },
      data: { invoicePath: null, invoiceFileName: null, invoiceMimeType: null, invoiceSize: null, invoiceProvider: null },
    })
    await removeStoredFile(previousPath)

    await writeAudit({
      user,
      action: 'DELETE_PURCHASE_INVOICE',
      entityType: 'PurchaseRequest',
      entityId: request.id,
      oldValue: { fileName: request.invoiceFileName },
      ip,
      userAgent,
    })
    return ok({ deleted: true })
  },
  { permission: 'purchase.order', rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' } }
)

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessTask } from '@/lib/daily'
import { validateAndProcess, storeAttachmentFile, removeStoredFile, UploadValidationError } from '@/lib/upload'
import { writeAudit } from '@/lib/audit'
import { logger, safeErrorMeta } from '@/lib/logger'

/**
 * آپلود «عکس اثبات انجام» برای آیتم وظیفه — مجوز: task.complete
 * چندلایه: Magic Bytes → بازپردازش Sharp (حذف EXIF/GPS) → سقف حجم → نام سرساخت.
 * فایل خصوصی می‌ماند و فقط با نشست دارای Scope سرو می‌شود.
 */
export const POST = apiHandler(
  async ({ req, user, params, ip, userAgent }) => {
    const { id: itemId } = await params

    const item = await db.dailyTaskItem.findUnique({
      where: { id: itemId },
      include: { task: { select: { id: true, workshopId: true, projectId: true, status: true } } },
    })
    if (!item || !(await canAccessTask(user, item.task))) {
      throw new ApiError(404, 'NOT_FOUND', 'آیتم وظیفه یافت نشد.')
    }
    if (item.task.status === 'CANCELLED') {
      throw new ApiError(409, 'TASK_CANCELLED', 'برای وظیفهٔ لغوشده نمی‌توان عکس بارگذاری کرد.')
    }

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      throw new ApiError(422, 'NO_FILE', 'فایلی ارسال نشده است.')
    }

    let processed
    try {
      processed = await validateAndProcess(file)
    } catch (err) {
      if (err instanceof UploadValidationError) {
        throw new ApiError(err.status, err.code, err.faMessage)
      }
      throw err
    }

    const stored = await storeAttachmentFile(processed, file.name || 'photo.jpg')

    // Rollback فایل در خطای DB — فایل یتیم باقی نمی‌ماند
    try {
      const photo = await db.taskItemPhoto.create({
        data: {
          itemId: item.id,
          fileName: stored.fileName,
          mimeType: processed.mime,
          size: stored.size,
          storagePath: stored.storagePath,
          uploadedById: user.id,
        },
      })
      await writeAudit({
        user,
        action: 'UPLOAD_ITEM_PHOTO',
        entityType: 'TaskItemPhoto',
        entityId: photo.id,
        newValue: { itemId: item.id, taskId: item.task.id, size: stored.size, mime: processed.mime },
        ip,
        userAgent,
      })
      return ok({ photoId: photo.id, fileName: stored.fileName }, { status: 201 })
    } catch (err) {
      await removeStoredFile(stored.storagePath)
      logger.error('daily', 'photo db insert failed — file rolled back', safeErrorMeta(err))
      throw new ApiError(500, 'INTERNAL_ERROR', 'ذخیرهٔ عکس ناموفق بود.')
    }
  },
  {
    permission: 'task.complete',
    rateLimit: { limit: 20, windowMs: 60_000, scope: 'item-photo' },
  }
)

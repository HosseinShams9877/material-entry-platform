import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessTask } from '@/lib/daily'
import { removeStoredFile } from '@/lib/upload'
import { writeAudit } from '@/lib/audit'

/** حذف عکس اثبات — فقط آپلودکننده یا ادمین (تاریخچه انجام آیتم حفظ می‌شود) */
export const DELETE = apiHandler(
  async ({ user, params, ip, userAgent }) => {
    const { id } = await params
    const photo = await db.taskItemPhoto.findUnique({
      where: { id },
      select: {
        id: true,
        storagePath: true,
        uploadedById: true,
        item: { include: { task: { select: { id: true, workshopId: true, projectId: true } } } },
      },
    })
    if (!photo || !(await canAccessTask(user, photo.item.task))) {
      throw new ApiError(404, 'NOT_FOUND', 'عکس یافت نشد.')
    }
    if (photo.uploadedById !== user.id && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'فقط آپلودکننده می‌تواند عکس را حذف کند.')
    }

    await db.taskItemPhoto.delete({ where: { id } })
    await removeStoredFile(photo.storagePath)
    await writeAudit({ user, action: 'DELETE_ITEM_PHOTO', entityType: 'TaskItemPhoto', entityId: id, ip, userAgent })
    return ok({ deleted: true })
  },
  { rateLimit: { limit: 30, windowMs: 60_000, scope: 'item-photo' } }
)

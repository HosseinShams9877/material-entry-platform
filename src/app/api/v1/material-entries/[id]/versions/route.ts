import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'

/** تاریخچه نسخه‌های ثبت — هرگز قابل حذف نیستند */
export const GET = apiHandler(async ({ user, params }) => {
  const { id } = params
  const entry = await db.materialEntry.findUnique({ where: { id }, select: { id: true, workshopId: true } })
  if (!entry || !(await canAccessEntry(user, entry))) {
    throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
  }
  const versions = await db.materialEntryVersion.findMany({
    where: { entryId: id },
    orderBy: { version: 'desc' },
    include: { changedBy: { select: { fullName: true } } },
  })
  return ok({
    versions: versions.map((v) => ({
      version: v.version,
      snapshot: JSON.parse(v.snapshotJson),
      changeReason: v.changeReason,
      changedBy: v.changedBy.fullName,
      createdAt: v.createdAt,
    })),
  })
})

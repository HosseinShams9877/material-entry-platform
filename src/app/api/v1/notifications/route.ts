import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'

export const GET = apiHandler(async ({ req, user }) => {
  const url = req.nextUrl
  const unreadOnly = url.searchParams.get('unread') === '1'
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = 20

  const [total, unreadCount, notifications] = await Promise.all([
    db.notification.count({ where: { userId: user.id } }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
    db.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return ok({ notifications, unreadCount, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } })
}, { rateLimit: { limit: 60, windowMs: 60_000, scope: 'notifications' } })

/** علامت‌گذاری به‌عنوان خوانده‌شده */
export const POST = apiHandler(
  async ({ user }) => {
    await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } })
    return ok({ marked: true })
  },
  { rateLimit: { limit: 30, windowMs: 60_000, scope: 'notifications' } }
)

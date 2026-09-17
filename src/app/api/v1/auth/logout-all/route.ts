import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { clearSessionCookie } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

/**
 * خروج از همهٔ نشست‌ها — همهٔ Sessionهای کاربر حذف می‌شوند و کوکی فعلی پاک می‌شود.
 * کاربرد: مشکوک‌شدن به لو رفتن توکن / تغییر دستگاه / پاک‌سازی امنیتی.
 */
export const POST = apiHandler(
  async ({ user, ip, userAgent }) => {
    let revoked = 0
    if (user) {
      const res = await db.session.deleteMany({ where: { userId: user.id } })
      revoked = res.count
      await writeAudit({
        user,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: user.id,
        ip,
        userAgent,
        reason: `خروج از همهٔ نشست‌ها (${revoked} نشست باطل شد)`,
      })
    }
    await clearSessionCookie()
    return ok({ loggedOut: true, revokedSessions: revoked })
  },
  { rateLimit: { limit: 5, windowMs: 60_000, scope: 'logout-all' } }
)

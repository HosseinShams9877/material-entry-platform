import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { loginSchema } from '@/lib/validate'
import { createSession, setSessionCookie, verifyPassword } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

export const POST = apiHandler(
  async ({ body, ip, userAgent }) => {
    const { username, password } = body

    const user = await db.user.findUnique({ where: { username } })
    if (!user || !user.isActive) {
      await writeAudit({ action: 'LOGIN_FAILED', entityType: 'User', entityId: username, ip, userAgent, reason: 'کاربر یافت نشد یا غیرفعال است' })
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'نام کاربری یا گذرواژه اشتباه است.')
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      await writeAudit({ action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id, ip, userAgent, reason: 'گذرواژه نادرست' })
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'نام کاربری یا گذرواژه اشتباه است.')
    }

    const { token, expiresAt } = await createSession(user.id, ip, userAgent)
    await setSessionCookie(token, expiresAt)

    const sessionUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role, workshopId: user.workshopId, phone: user.phone }
    await writeAudit({ user: sessionUser, action: 'LOGIN', entityType: 'User', entityId: user.id, ip, userAgent })

    return ok({ user: sessionUser })
  },
  {
    auth: false,
    schema: loginSchema,
    rateLimit: { limit: 8, windowMs: 60_000, scope: 'login' },
  }
)

import { apiHandler, ok } from '@/lib/api'
import { destroySession, getSessionUser } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

export const POST = apiHandler(
  async ({ ip, userAgent }) => {
    const user = await getSessionUser()
    if (user) {
      await writeAudit({ user, action: 'LOGOUT', entityType: 'User', entityId: user.id, ip, userAgent })
    }
    await destroySession()
    return ok({ loggedOut: true })
  },
  { auth: false }
)

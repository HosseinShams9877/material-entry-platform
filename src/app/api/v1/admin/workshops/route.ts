import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { workshopSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

export const GET = apiHandler(
  async () => {
    const workshops = await db.workshop.findMany({
      include: { _count: { select: { projects: true, users: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return ok({ workshops })
  },
  { permission: 'workshops.manage' }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const exists = await db.workshop.findUnique({ where: { code: body.code } })
    if (exists) throw new ApiError(409, 'CODE_TAKEN', 'این کد کارگاه قبلاً استفاده شده است.')
    const created = await db.workshop.create({ data: body })
    await writeAudit({ user, action: 'CREATE', entityType: 'Workshop', entityId: created.id, newValue: { name: created.name, code: created.code }, ip, userAgent })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'workshops.manage', schema: workshopSchema }
)

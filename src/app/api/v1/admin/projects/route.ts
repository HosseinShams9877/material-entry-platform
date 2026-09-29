import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { projectSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

export const GET = apiHandler(
  async () => {
    const projects = await db.project.findMany({
      include: { workshop: { select: { id: true, name: true } }, _count: { select: { entries: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return ok({ projects })
  },
  { permission: 'projects.manage' }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const exists = await db.project.findUnique({ where: { code: body.code } })
    if (exists) throw new ApiError(409, 'CODE_TAKEN', 'این کد پروژه قبلاً استفاده شده است.')
    const created = await db.project.create({ data: body })
    await writeAudit({ user, action: 'CREATE', entityType: 'Project', entityId: created.id, newValue: { name: created.name, code: created.code }, ip, userAgent })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'projects.manage', schema: projectSchema }
)

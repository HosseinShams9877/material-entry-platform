import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { workshopSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.workshop.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'کارگاه یافت نشد.')
      const updated = await db.workshop.update({ where: { id }, data: { name: body.name ?? target.name, code: body.code ?? target.code, address: body.address ?? target.address, isActive: body.isActive ?? target.isActive } })
      await writeAudit({ user, action: 'EDIT', entityType: 'Workshop', entityId: id, oldValue: { name: target.name, isActive: target.isActive }, newValue: { name: updated.name, isActive: updated.isActive }, ip, userAgent })
      return ok({ id: updated.id })
    },
    { permission: 'workshops.manage', schema: workshopSchema.partial() }
  )(req, ctx)
}

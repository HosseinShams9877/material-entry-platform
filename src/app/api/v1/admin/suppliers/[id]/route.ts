import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { supplierSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.supplier.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'تأمین‌کننده یافت نشد.')
      const updated = await db.supplier.update({
        where: { id },
        data: {
          name: body.name ?? target.name,
          phone: body.phone ?? target.phone,
          workshopId: body.workshopId !== undefined ? body.workshopId : target.workshopId,
          isActive: body.isActive ?? target.isActive,
        },
      })
      await writeAudit({ user, action: 'EDIT', entityType: 'Supplier', entityId: id, oldValue: { name: target.name }, newValue: { name: updated.name, isActive: updated.isActive }, ip, userAgent })
      return ok({ id: updated.id })
    },
    { permission: 'masterdata.manage', schema: supplierSchema.partial() }
  )(req, ctx)
}

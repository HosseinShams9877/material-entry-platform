import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { workerSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.worker.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'فرد یافت نشد.')
      const updated = await db.worker.update({
        where: { id },
        data: {
          fullName: body.fullName ?? target.fullName,
          kind: body.kind ?? target.kind,
          phone: body.phone ?? target.phone,
          workshopId: body.workshopId !== undefined ? body.workshopId : target.workshopId,
          isActive: body.isActive ?? target.isActive,
        },
      })
      await writeAudit({ user, action: 'EDIT', entityType: 'Worker', entityId: id, oldValue: { fullName: target.fullName }, newValue: { fullName: updated.fullName, isActive: updated.isActive }, ip, userAgent })
      return ok({ id: updated.id })
    },
    { permission: 'masterdata.manage', schema: workerSchema.partial() }
  )(req, ctx)
}

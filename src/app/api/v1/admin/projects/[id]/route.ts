import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { projectSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.project.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'پروژه یافت نشد.')
      const updated = await db.project.update({
        where: { id },
        data: {
          name: body.name ?? target.name,
          code: body.code ?? target.code,
          workshopId: body.workshopId !== undefined ? body.workshopId : target.workshopId,
          clientName: body.clientName ?? target.clientName,
          isActive: body.isActive ?? target.isActive,
        },
      })
      await writeAudit({ user, action: 'EDIT', entityType: 'Project', entityId: id, oldValue: { name: target.name, isActive: target.isActive }, newValue: { name: updated.name, isActive: updated.isActive }, ip, userAgent })
      return ok({ id: updated.id })
    },
    { permission: 'projects.manage', schema: projectSchema.partial() }
  )(req, ctx)
}

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { materialSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.material.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'مصالح یافت نشد.')
      // همگام‌سازی نام دسته با جدول دسته‌بندی‌ها
      let category = body.category !== undefined ? body.category : target.category
      const categoryId = body.categoryId !== undefined ? body.categoryId : target.categoryId
      if (categoryId) {
        const cat = await db.materialCategory.findUnique({ where: { id: categoryId } })
        if (cat) category = cat.name
      }
      const updated = await db.material.update({
        where: { id },
        data: {
          name: body.name ?? target.name,
          category: category ?? null,
          categoryId: categoryId ?? null,
          defaultUnit: body.defaultUnit ?? target.defaultUnit,
          workshopId: body.workshopId !== undefined ? body.workshopId : target.workshopId,
          isActive: body.isActive ?? target.isActive,
        },
      })
      await writeAudit({ user, action: 'EDIT', entityType: 'Material', entityId: id, oldValue: { name: target.name }, newValue: { name: updated.name, isActive: updated.isActive }, ip, userAgent })
      return ok({ id: updated.id })
    },
    { permission: 'masterdata.manage', schema: materialSchema.partial() }
  )(req, ctx)
}

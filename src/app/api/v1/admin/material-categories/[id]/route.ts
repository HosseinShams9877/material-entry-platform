import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { materialCategorySchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ─────────────────────────── ویرایش/حذف دسته‌بندی مصالح ───────────────────────────

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.materialCategory.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'دسته‌بندی یافت نشد.')

      const name = (body.name ?? target.name).trim()
      if (name !== target.name) {
        const dup = await db.materialCategory.findUnique({ where: { name } })
        if (dup) throw new ApiError(409, 'DUPLICATE', 'دسته‌بندی‌ای با این نام از قبل وجود دارد.')
      }

      const updated = await db.materialCategory.update({
        where: { id },
        data: { name, isActive: body.isActive ?? target.isActive },
      })
      await writeAudit({
        user,
        action: 'EDIT',
        entityType: 'MaterialCategory',
        entityId: id,
        oldValue: { name: target.name },
        newValue: { name: updated.name, isActive: updated.isActive },
        ip,
        userAgent,
      })
      return ok({ id: updated.id })
    },
    { permission: 'masterdata.manage', schema: materialCategorySchema.partial() }
  )(req, ctx)
}

export async function DELETE(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.materialCategory.findUnique({
        where: { id },
        include: { _count: { select: { materials: true } } },
      })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'دسته‌بندی یافت نشد.')

      // اگر مصالحی به این دسته متصل است، فقط غیرفعال می‌شود — برای حفظ سابقه
      if (target._count.materials > 0) {
        await db.materialCategory.update({ where: { id }, data: { isActive: false } })
        await writeAudit({ user, action: 'EDIT', entityType: 'MaterialCategory', entityId: id, oldValue: { name: target.name }, ip, userAgent })
        return ok({ deactivated: true })
      }

      await db.materialCategory.delete({ where: { id } })
      await writeAudit({ user, action: 'EDIT', entityType: 'MaterialCategory', entityId: id, oldValue: { name: target.name }, ip, userAgent })
      return ok({ deleted: true })
    },
    { permission: 'masterdata.manage' }
  )(req, ctx)
}

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { supplierSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ─────────────────────────── ویرایش تأمین‌کننده — assign به چند کارگاه ───────────────────────────

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.supplier.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'تأمین‌کننده یافت نشد.')

      // کارگاه‌های مقصد: آرایهٔ جدید یا حفظ مقدار فعلی (کارگاه اصلی + دسترسی‌ها)
      const currentIds = await db.supplierWorkshop.findMany({ where: { supplierId: id }, select: { workshopId: true } })
      const currentSet = Array.from(new Set([...currentIds.map((c) => c.workshopId), ...(target.workshopId ? [target.workshopId] : [])]))
      const nextIds: string[] | null =
        body.workshopIds !== undefined
          ? Array.from(new Set([...(body.workshopIds ?? []), ...(body.workshopId ? [body.workshopId] : [])]))
          : body.workshopId !== undefined && body.workshopId && !currentSet.includes(body.workshopId)
            ? [...currentSet, body.workshopId]
            : null

      const updated = await db.$transaction(async (tx) => {
        const row = await tx.supplier.update({
          where: { id },
          data: {
            name: body.name ?? target.name,
            phone: body.phone ?? target.phone,
            workshopId: body.workshopId !== undefined ? body.workshopId : target.workshopId,
            isActive: body.isActive ?? target.isActive,
          },
        })
        if (nextIds) {
          await tx.supplierWorkshop.deleteMany({ where: { supplierId: id } })
          if (nextIds.length > 0) {
            await tx.supplierWorkshop.createMany({ data: nextIds.map((workshopId) => ({ supplierId: id, workshopId })) })
          }
        }
        return row
      })

      await writeAudit({
        user,
        action: 'EDIT',
        entityType: 'Supplier',
        entityId: id,
        oldValue: { name: target.name },
        newValue: { name: updated.name, isActive: updated.isActive, workshops: nextIds?.length ?? currentSet.length },
        ip,
        userAgent,
      })
      return ok({ id: updated.id })
    },
    { permission: 'masterdata.manage', schema: supplierSchema.partial() }
  )(req, ctx)
}

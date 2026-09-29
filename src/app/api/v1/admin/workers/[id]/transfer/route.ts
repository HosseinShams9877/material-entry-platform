import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { transferWorkerSchema } from '@/lib/validate'
import { tehranDayStart } from '@/lib/daily'

// ─────────────────────────── POST /api/v1/admin/workers/[id]/transfer — جابجایی نیرو بین کارگاه‌ها ───────────────────────────
// کارگاه فعلی کارگر به مقصد تغییر می‌کند و رکورد کامل جابجایی در «سابقهٔ نیرو» حفظ می‌شود.

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const worker = await db.worker.findUnique({ where: { id: params.id } })
    if (!worker) throw new ApiError(404, 'NOT_FOUND', 'فرد یافت نشد.')

    if (body.toWorkshopId === worker.workshopId) {
      throw new ApiError(422, 'SAME_WORKSHOP', 'کارگر همین حالا در این کارگاه است.')
    }
    const target = await db.workshop.findUnique({ where: { id: body.toWorkshopId } })
    if (!target || !target.isActive) {
      throw new ApiError(422, 'INVALID_WORKSHOP', 'کارگاه مقصد معتبر نیست.')
    }

    const transferred = await db.$transaction(async (tx) => {
      const t = await tx.workerTransfer.create({
        data: {
          workerId: worker.id,
          fromWorkshopId: worker.workshopId,
          toWorkshopId: body.toWorkshopId,
          transferredAt: tehranDayStart(body.transferredAt),
          reason: body.reason ?? null,
          createdById: user.id,
        },
      })
      await tx.worker.update({
        where: { id: worker.id },
        data: { workshopId: body.toWorkshopId },
      })
      return t
    })

    await writeAudit({
      user,
      action: 'TRANSFER_WORKER',
      entityType: 'Worker',
      entityId: worker.id,
      oldValue: { workshopId: worker.workshopId },
      newValue: { workshopId: body.toWorkshopId, transferId: transferred.id, transferredAt: body.transferredAt, reason: body.reason ?? null },
      ip,
      userAgent,
    })

    return ok({ transferId: transferred.id, workshopId: body.toWorkshopId }, { status: 201 })
  },
  { permission: 'masterdata.manage', schema: transferWorkerSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'admin-write' } }
)

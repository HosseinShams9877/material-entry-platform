import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'

// ─────────────────────────── GET /api/v1/admin/workers/transfers — سابقهٔ جابجایی نیرو ───────────────────────────
// ?workerId= برای سابقهٔ یک فرد خاص؛ بدون پارامتر، آخرین جابجایی‌ها (پروندهٔ نیرو).

export const GET = apiHandler(
  async ({ req }) => {
    const workerId = req.nextUrl.searchParams.get('workerId')
    const take = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('take') ?? '50') || 50))

    const transfers = await db.workerTransfer.findMany({
      where: workerId ? { workerId } : {},
      include: {
        worker: { select: { id: true, fullName: true } },
        fromWorkshop: { select: { id: true, name: true } },
        toWorkshop: { select: { id: true, name: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: { transferredAt: 'desc' },
      take,
    })

    return ok({
      transfers: transfers.map((t) => ({
        id: t.id,
        workerId: t.workerId,
        workerName: t.worker.fullName,
        fromWorkshopId: t.fromWorkshopId,
        fromWorkshopName: t.fromWorkshop?.name ?? null,
        toWorkshopId: t.toWorkshopId,
        toWorkshopName: t.toWorkshop.name,
        transferredAt: t.transferredAt.toISOString(),
        reason: t.reason,
        createdByName: t.createdBy.fullName,
        createdAt: t.createdAt.toISOString(),
      })),
    })
  },
  { permission: 'masterdata.manage', rateLimit: { limit: 60, windowMs: 60_000, scope: 'admin' } }
)

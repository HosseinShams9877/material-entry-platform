import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { supplierSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

// ─────────────────────────── تأمین‌کنندگان — چند-کارگاهی ───────────────────────────

export const GET = apiHandler(
  async ({ req }) => {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    const suppliers = await db.supplier.findMany({
      where: q ? { name: { contains: q } } : {},
      include: {
        workshop: { select: { id: true, name: true } },
        workshopAccess: { include: { workshop: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    })
    return ok({
      suppliers: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        workshopId: s.workshopId,
        workshops: Array.from(
          new Map(
            [
              ...(s.workshop ? [{ id: s.workshop.id, name: s.workshop.name }] : []),
              ...s.workshopAccess.map((sw) => ({ id: sw.workshop.id, name: sw.workshop.name })),
            ].map((w) => [w.id, w])
          ).values()
        ),
        isActive: s.isActive,
      })),
    })
  },
  { permission: 'masterdata.manage' }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const workshopIds = Array.from(new Set([...(body.workshopIds ?? []), ...(body.workshopId ? [body.workshopId] : [])]))
    const created = await db.supplier.create({
      data: {
        name: body.name,
        phone: body.phone ?? null,
        workshopId: body.workshopId ?? workshopIds[0] ?? null,
        isActive: body.isActive,
        workshopAccess: {
          create: workshopIds.map((workshopId) => ({ workshopId })),
        },
      },
    })
    await writeAudit({ user, action: 'CREATE', entityType: 'Supplier', entityId: created.id, newValue: { name: created.name, workshops: workshopIds.length }, ip, userAgent })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'masterdata.manage', schema: supplierSchema }
)

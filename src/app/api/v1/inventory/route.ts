import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { getUserScope, inventoryScopeFilterFor } from '@/lib/scope'
import type { Prisma } from '@prisma/client'
// ─────────────────────────── GET /api/v1/inventory — موجودی انبار کارگاه‌ها ───────────────────────────
// خطوط موجودی به تفکیک کارگاه × مصالح × واحد + نشانگر «کمبود» بر اساس حداقل موجودی.

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)
    const scopeFilter = await inventoryScopeFilterFor(user, scope)

    const url = req.nextUrl
    const workshopId = url.searchParams.get('workshopId')
    const q = url.searchParams.get('q')?.trim()

    const and: Prisma.InventoryStockWhereInput[] = [scopeFilter as Prisma.InventoryStockWhereInput]
    if (workshopId) and.push({ workshopId })
    if (q) and.push({ materialName: { contains: q } })

    const stocks = await db.inventoryStock.findMany({
      where: { AND: and },
      include: { workshop: { select: { id: true, name: true, code: true } } },
      orderBy: [{ workshopId: 'asc' }, { materialName: 'asc' }],
    })

    return ok({
      stocks: stocks.map((s) => ({
        id: s.id,
        workshopId: s.workshopId,
        workshopName: s.workshop.name,
        materialId: s.materialId,
        materialName: s.materialName,
        unit: s.unit,
        quantity: s.quantity,
        minQuantity: s.minQuantity,
        isLow: s.minQuantity != null && s.quantity < s.minQuantity,
        updatedAt: s.updatedAt.toISOString(),
      })),
    })
  },
  { permission: 'inventory.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'inventory' } }
)

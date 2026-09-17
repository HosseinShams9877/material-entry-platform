import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { stockMinQuantitySchema } from '@/lib/validate'

// ─────────────────────────── PATCH /api/v1/inventory/stocks/[id] — تعیین حداقل موجودی ───────────────────────────

export const PATCH = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const stock = await db.inventoryStock.findUnique({ where: { id: params.id } })
    if (!stock) throw new ApiError(404, 'NOT_FOUND', 'خط موجودی یافت نشد.')

    const scope = await getUserScope(user)
    if (!scope.isGlobal && !scope.workshopIds.includes(stock.workshopId)) {
      throw new ApiError(404, 'NOT_FOUND', 'خط موجودی یافت نشد.')
    }

    const updated = await db.inventoryStock.update({
      where: { id: stock.id },
      data: { minQuantity: body.minQuantity },
    })

    await writeAudit({
      user,
      action: 'STOCK_MIN_UPDATE',
      entityType: 'InventoryStock',
      entityId: stock.id,
      oldValue: { minQuantity: stock.minQuantity },
      newValue: { minQuantity: updated.minQuantity },
      ip,
      userAgent,
    })

    return ok({ id: updated.id, minQuantity: updated.minQuantity })
  },
  { permission: 'inventory.manage', schema: stockMinQuantitySchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'inventory-write' } }
)

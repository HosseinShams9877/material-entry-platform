import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { stockMinQuantitySchema, stockAdjustSchema } from '@/lib/validate'

// ─────────────────────────── PATCH /api/v1/inventory/stocks/[id] ───────────────────────────
// حالت ۱: { minQuantity } — تعیین حداقل موجودی
// حالت ۲: { quantity, note } — تغییر مستقیم موجودی توسط انباردار (گردش ADJUST خودکار ثبت می‌شود)

export const PATCH = apiHandler(
  async ({ req, user, params, ip, userAgent }) => {
    // بدنه یک‌بار خوانده می‌شود — انتخاب اسکیما بر اساس وجود quantity
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const isAdjust = typeof raw.quantity !== 'undefined'

    const parsed = isAdjust ? stockAdjustSchema.safeParse(raw) : stockMinQuantitySchema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      throw new ApiError(422, 'VALIDATION_ERROR', first?.message ?? 'اطلاعات ارسالی معتبر نیست.')
    }
    const body = parsed.data as { minQuantity?: number | null; quantity?: number; note?: string | null }

    const { id } = params
    const stock = await db.inventoryStock.findUnique({ where: { id } })
    if (!stock) throw new ApiError(404, 'NOT_FOUND', 'خط موجودی یافت نشد.')

    const scope = await getUserScope(user)
    if (!scope.isGlobal && !scope.workshopIds.includes(stock.workshopId)) {
      throw new ApiError(404, 'NOT_FOUND', 'خط موجودی یافت نشد.')
    }

    // ── تعدیل مستقیم موجودی ──
    if (isAdjust) {
      const newQty = body.quantity as number
      const delta = newQty - stock.quantity
      if (Math.abs(delta) < 1e-9) {
        return ok({ id: stock.id, quantity: stock.quantity, unchanged: true })
      }
      if (newQty < 0) throw new ApiError(422, 'INVALID_QUANTITY', 'موجودی نمی‌تواند منفی باشد.')

      const updated = await db.$transaction(async (tx) => {
        const row = await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: newQty },
        })
        await tx.inventoryMovement.create({
          data: {
            workshopId: stock.workshopId,
            stockId: stock.id,
            materialId: stock.materialId,
            materialName: stock.materialName,
            unit: stock.unit,
            quantity: Math.abs(delta),
            direction: delta > 0 ? 'IN' : 'OUT',
            reason: 'ADJUST',
            note: body.note ?? 'تعدیل دستی موجودی انبار',
            createdById: user.id,
          },
        })
        return row
      })

      await writeAudit({
        user,
        action: 'STOCK_QUANTITY_ADJUST',
        entityType: 'InventoryStock',
        entityId: stock.id,
        oldValue: { quantity: stock.quantity },
        newValue: { quantity: updated.quantity },
        reason: body.note ?? null,
        ip,
        userAgent,
      })
      return ok({ id: updated.id, quantity: updated.quantity })
    }

    // ── تعیین حداقل موجودی ──
    const updated = await db.inventoryStock.update({
      where: { id: stock.id },
      data: { minQuantity: body.minQuantity ?? null },
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
  { permission: 'inventory.manage', rateLimit: { limit: 30, windowMs: 60_000, scope: 'inventory-write' } }
)

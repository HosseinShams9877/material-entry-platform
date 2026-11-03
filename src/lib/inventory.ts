import { db } from '@/lib/db'
import { logger, safeErrorMeta } from '@/lib/logger'

// ─────────────────────────── هستهٔ مشترک انبار کارگاه ───────────────────────────
// ورود خودکار موجودی از «دریافت خرید» و «تأیید انبار ثبت ورود مصالح»؛
// خروج دستی انباردار. هیچ دادهٔ مالی — صرفاً تعداد فیزیکی.
// توابع ضدخطا: خطای انبار هرگز جریان اصلی (Workflow/خرید) را شکست نمی‌دهد.

export interface StockItem {
  workshopId: string
  materialId?: string | null
  materialName: string
  unit: string
  quantity: number
}

/**
 * اعمال ورود موجودی (چند قلم) — Upsert خط موجودی + رکورد گردش IN.
 * داخل یک تراکنش؛ هرگز throw نمی‌کند (فقط لاگ ساختاریافته).
 */
export async function applyStockIn(
  items: StockItem[],
  meta: { reason: 'PURCHASE' | 'ENTRY' | 'RETURN'; purchaseRequestId?: string | null; createdById: string }
): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      for (const it of items) {
        if (!it.materialName.trim() || !(it.quantity > 0)) continue
        const stock = await tx.inventoryStock.upsert({
          where: { workshopId_materialName_unit: { workshopId: it.workshopId, materialName: it.materialName, unit: it.unit } },
          update: { quantity: { increment: it.quantity }, ...(it.materialId ? { materialId: it.materialId } : {}) },
          create: {
            workshopId: it.workshopId,
            materialId: it.materialId ?? null,
            materialName: it.materialName,
            unit: it.unit,
            quantity: it.quantity,
          },
        })
        await tx.inventoryMovement.create({
          data: {
            workshopId: it.workshopId,
            stockId: stock.id,
            materialId: it.materialId ?? null,
            materialName: it.materialName,
            unit: it.unit,
            quantity: it.quantity,
            direction: 'IN',
            reason: meta.reason,
            purchaseRequestId: meta.purchaseRequestId ?? null,
            createdById: meta.createdById,
            note: meta.reason === 'ENTRY' ? null : null,
          },
        })
      }
    })
  } catch (err) {
    logger.error('inventory', 'stock-in failed', safeErrorMeta(err))
  }
}

/** اعمال ورود موجودی برای تأیید انبار ثبت مصالح — ضدتکرار با inventoryAppliedAt */
export async function applyEntryStockIn(
  entry: {
    id: string
    workshopId: string
    inventoryAppliedAt: Date | null
    items: Array<{ materialId: string | null; materialName: string; quantity: number; unit: string }>
  },
  userId: string
): Promise<void> {
  if (entry.inventoryAppliedAt) return // قبلاً اعمال شده — Rollback/تأیید مجدد دوباره حساب نمی‌شود
  await applyStockIn(
    entry.items.map((i) => ({
      workshopId: entry.workshopId,
      materialId: i.materialId,
      materialName: i.materialName,
      unit: i.unit,
      quantity: i.quantity,
    })),
    { reason: 'ENTRY', createdById: userId }
  )
  await db.materialEntry
    .update({ where: { id: entry.id }, data: { inventoryAppliedAt: new Date() } })
    .catch((err: unknown) => logger.error('inventory', 'failed to mark inventoryAppliedAt', safeErrorMeta(err)))
}

/**
 * اعمال خروج موجودی (چند قلم) — Decrements خط موجودی + رکورد گردش OUT.
 * اگر موجودی کافی نباشد، ثبت خروج lob نمی‌شود؛ در عوض «کمبود» اعلام می‌شود
 * (رکورد StockDiscrepancy) تا انباردار/سرپرست ببینند چه قلمی ناقص خارج شده است.
 * هرگز throw نمی‌کند — جریان اصلی Workflow شکسته نمی‌شود.
 */
export async function applyStockOut(
  items: StockItem[],
  meta: { reason: 'ISSUE' | 'ENTRY'; createdById: string; note?: string | null }
): Promise<void> {
  for (const it of items) {
    if (!it.materialName.trim() || !(it.quantity > 0)) continue
    const stock = await db.inventoryStock.findUnique({
      where: { workshopId_materialName_unit: { workshopId: it.workshopId, materialName: it.materialName, unit: it.unit } },
    })
    if (!stock || stock.quantity < it.quantity) {
      logger.error('inventory', 'stock-out insufficient', { workshopId: it.workshopId, materialName: it.materialName, requested: it.quantity, available: stock?.quantity ?? null })
      try {
        await db.stockDiscrepancy.create({
          data: {
            workshopId: it.workshopId,
            stockId: stock?.id ?? null,
            materialName: it.materialName,
            unit: it.unit,
            systemQty: stock?.quantity ?? 0,
            actualQty: stock ? stock.quantity - it.quantity : -it.quantity,
            kind: 'SHORTAGE',
            note: `خروج مصالح — موجودی انبار کافی نبود (${meta.reason})${meta.note ? ` — ${meta.note}` : ''}`,
            createdById: meta.createdById,
          },
        })
      } catch (err) {
        logger.error('inventory', 'failed to record stock-out discrepancy', safeErrorMeta(err))
      }
      continue
    }
    await db.$transaction(async (tx) => {
      const updated = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: { decrement: it.quantity }, ...(it.materialId ? { materialId: it.materialId } : {}) },
      })
      await tx.inventoryMovement.create({
        data: {
          workshopId: it.workshopId,
          stockId: stock.id,
          materialId: it.materialId ?? stock.materialId,
          materialName: it.materialName,
          unit: it.unit,
          quantity: it.quantity,
          direction: 'OUT',
          reason: meta.reason,
          note: meta.note ?? null,
          createdById: meta.createdById,
        },
      })
      return updated
    }).catch((err: unknown) => logger.error('inventory', 'stock-out failed', safeErrorMeta(err)))
  }
}

/** اعمال موجودی ثبت مصالح روی انبار کارگاه — بسته به جهت: IN افزایش، OUT کاهش */
export async function applyEntryStock(
  entry: {
    id: string
    direction: string
    workshopId: string
    inventoryAppliedAt: Date | null
    items: Array<{ materialId: string | null; materialName: string; quantity: number; unit: string }>
  },
  userId: string
): Promise<void> {
  if (entry.inventoryAppliedAt) return // ضدتکرار
  if (entry.direction === 'OUT') {
    await applyStockOut(
      entry.items.map((i) => ({
        workshopId: entry.workshopId,
        materialId: i.materialId,
        materialName: i.materialName,
        unit: i.unit,
        quantity: i.quantity,
      })),
      { reason: 'ENTRY', createdById: userId, note: `ثبت خروج شمارهٔ ${entry.id}` }
    )
  } else {
    await applyEntryStockIn(entry, userId)
  }
  await db.materialEntry
    .update({ where: { id: entry.id }, data: { inventoryAppliedAt: new Date() } })
    .catch((err: unknown) => logger.error('inventory', 'failed to mark inventoryAppliedAt', safeErrorMeta(err)))
}

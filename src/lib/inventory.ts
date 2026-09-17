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

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, inventoryScopeFilterFor } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { inventoryMovementSchema } from '@/lib/validate'
import { notifyUsers } from '@/lib/notify'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/inventory/movements — گردش انبار ───────────────────────────

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)
    const scopeFilter = await inventoryScopeFilterFor(user, scope)

    const url = req.nextUrl
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20') || 20))
    const workshopId = url.searchParams.get('workshopId')
    const direction = url.searchParams.get('direction')
    const q = url.searchParams.get('q')?.trim()

    const and: Prisma.InventoryMovementWhereInput[] = [scopeFilter as Prisma.InventoryMovementWhereInput]
    if (workshopId) and.push({ workshopId })
    if (direction === 'IN' || direction === 'OUT') and.push({ direction })
    if (q) and.push({ materialName: { contains: q } })

    const where: Prisma.InventoryMovementWhereInput = { AND: and }

    const [total, movements] = await Promise.all([
      db.inventoryMovement.count({ where }),
      db.inventoryMovement.findMany({
        where,
        include: {
          workshop: { select: { name: true } },
          createdBy: { select: { fullName: true } },
          purchaseRequest: { select: { id: true, number: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return ok({
      movements: movements.map((m) => ({
        id: m.id,
        workshopId: m.workshopId,
        workshopName: m.workshop.name,
        materialName: m.materialName,
        unit: m.unit,
        quantity: m.quantity,
        direction: m.direction,
        reason: m.reason,
        note: m.note,
        purchaseRequestId: m.purchaseRequestId,
        purchaseRequestNumber: m.purchaseRequest?.number ?? null,
        createdByName: m.createdBy.fullName,
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  },
  { permission: 'inventory.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'inventory' } }
)

// ─────────────────────────── POST /api/v1/inventory/movements — ثبت خروج / برگشت / تعدیل ───────────────────────────
// خروج (مصرف/تحویل به کارگاه) توسط انباردار؛ موجودی در همان تراکنش به‌روز می‌شود
// و در صورت رفتن زیر حداقل، «کمبود» در داشبورد و فهرست انبار نشان داده می‌شود.

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const { workshopId, materialId, materialName, unit, quantity, direction, reason, note } = body
    const scope = await getUserScope(user)

    if (!scope.isGlobal && !scope.workshopIds.includes(workshopId)) {
      throw new ApiError(403, 'FORBIDDEN', 'به این کارگاه دسترسی ندارید.')
    }

    const result = await db.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.findUnique({
        where: { workshopId_materialName_unit: { workshopId, materialName, unit } },
      })

      if (direction === 'OUT') {
        if (!stock) throw new ApiError(422, 'STOCK_NOT_FOUND', 'برای این مصالح موجودی ثبت نشده است.')
        if (stock.quantity < quantity) {
          throw new ApiError(
            422,
            'INSUFFICIENT_STOCK',
            `موجودی کافی نیست — موجودی فعلی ${stock.quantity.toLocaleString('fa-IR')} ${unit} است.`
          )
        }
        const updated = await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: { decrement: quantity } },
        })
        const movement = await tx.inventoryMovement.create({
          data: {
            workshopId,
            stockId: stock.id,
            materialId: materialId ?? stock.materialId,
            materialName,
            unit,
            quantity,
            direction: 'OUT',
            reason,
            note: note ?? null,
            createdById: user.id,
          },
        })
        return { movement, stock: updated }
      }

      // IN دستی (برگشت / تعدیل مثبت)
      const updated = await tx.inventoryStock.upsert({
        where: { workshopId_materialName_unit: { workshopId, materialName, unit } },
        update: { quantity: { increment: quantity }, ...(materialId ? { materialId } : {}) },
        create: { workshopId, materialId: materialId ?? null, materialName, unit, quantity },
      })
      const movement = await tx.inventoryMovement.create({
        data: {
          workshopId,
          stockId: updated.id,
          materialId: materialId ?? null,
          materialName,
          unit,
          quantity,
          direction: 'IN',
          reason,
          note: note ?? null,
          createdById: user.id,
        },
      })
      return { movement, stock: updated }
    })

    await writeAudit({
      user,
      action: direction === 'OUT' ? 'ISSUE_INVENTORY' : 'ADJUST_INVENTORY',
      entityType: 'InventoryMovement',
      entityId: result.movement.id,
      newValue: {
        materialName,
        unit,
        quantity,
        direction,
        reason,
        remainingQuantity: result.stock.quantity,
        workshopId,
      },
      ip,
      userAgent,
    })

    // هشدار کمبود — اگر موجودی زیر حداقل رفت، به انباردارهای همان کارگاه اعلان بده
    if (
      result.stock.minQuantity != null &&
      result.stock.quantity < result.stock.minQuantity
    ) {
      const already = await db.notification.findFirst({
        where: {
          type: 'PURCHASE_STALE',
          entityType: 'InventoryStock',
          entityId: result.stock.id,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      })
      if (!already) {
        const warehouses = await db.user.findMany({
          where: {
            isActive: true,
            role: 'WAREHOUSE_MANAGER',
            OR: [{ workshopId }, { userWorkshops: { some: { workshopId } } }],
          },
          select: { id: true },
        })
        await notifyUsers({
          userIds: warehouses.map((w) => w.id),
          type: 'PURCHASE_STALE',
          title: 'کمبود موجودی انبار',
          body: `موجودی «${materialName}» به ${result.stock.quantity.toLocaleString('fa-IR')} ${unit} رسید — کمتر از حداقل تعیین‌شده (${result.stock.minQuantity.toLocaleString('fa-IR')}). نیاز خرید را اعلام کنید.`,
          entityId: result.stock.id,
          entityType: 'InventoryStock',
        })
      }
    }

    return ok(
      {
        movementId: result.movement.id,
        remainingQuantity: result.stock.quantity,
        isLow: result.stock.minQuantity != null && result.stock.quantity < result.stock.minQuantity,
      },
      { status: 201 }
    )
  },
  { permission: 'inventory.manage', schema: inventoryMovementSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'inventory-write' } }
)

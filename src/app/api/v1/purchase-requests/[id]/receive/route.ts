import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { applyStockIn } from '@/lib/inventory'

// ─────────────────────────── POST /api/v1/purchase-requests/[id]/receive — دریافت در انبار ───────────────────────────
// حلقهٔ کنترل خرید بسته می‌شود: نیاز → تأیید → خرید → دریافت.
// با دریافت، اقلام به‌صورت خودکار به موجودی انبار کارگاه اضافه می‌شوند (گردش IN — دلیل: PURCHASE).

export const POST = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const request = await db.purchaseRequest.findUnique({ where: { id: params.id }, include: { items: true } })
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const scope = await getUserScope(user)
    const canAct =
      scope.isGlobal ||
      scope.workshopIds.includes(request.workshopId) ||
      (request.projectId && scope.projectIds !== null && scope.projectIds.includes(request.projectId))
    if (!canAct) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')
    if (request.status !== 'ORDERED') {
      throw new ApiError(423, 'PURCHASE_NOT_RECEIVABLE', 'فقط درخواست خریداری‌شده قابل دریافت است.')
    }

    const now = new Date()
    await db.purchaseRequest.update({
      where: { id: request.id },
      data: { status: 'RECEIVED', receivedById: user.id, receivedAt: now },
    })

    await writeAudit({
      user,
      action: 'RECEIVE_PURCHASE',
      entityType: 'PurchaseRequest',
      entityId: request.id,
      oldValue: { status: 'ORDERED' },
      newValue: { status: 'RECEIVED', itemsCount: request.items.length },
      ip,
      userAgent,
    })

    // ورود خودکار اقلام به موجودی انبار کارگاه — ضدخطا (جریان اصلی را شکست نمی‌دهد)
    await applyStockIn(
      request.items.map((i) => ({
        workshopId: request.workshopId,
        materialId: i.materialId,
        materialName: i.materialName,
        unit: i.unit,
        quantity: i.quantity,
      })),
      { reason: 'PURCHASE', purchaseRequestId: request.id, createdById: user.id }
    )

    await notifyUsers({
      userIds: [request.requestedById].filter((id) => id !== user.id),
      type: 'PURCHASE_RECEIVED',
      title: 'مصالح به انبار تحویل شد',
      body: `درخواست خرید شمارهٔ ${request.number.toLocaleString('fa-IR')} توسط انباردار «${user.fullName}» دریافت و به موجودی انبار اضافه شد.`,
      entityId: request.id,
      entityType: 'PurchaseRequest',
    })

    return ok({ status: 'RECEIVED' })
  },
  { permission: 'purchase.receive', rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' } }
)

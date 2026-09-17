import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, canAccessWorkshopRecord } from '@/lib/scope'
import { updatePurchaseSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { computePaymentInfo } from '@/lib/finance'
import { tehranDayStart } from '@/lib/daily'

// ─────────────────────────── GET /api/v1/purchase-requests/[id] — جزئیات درخواست ───────────────────────────

export const GET = apiHandler(
  async ({ params, user }) => {
    const request = await db.purchaseRequest.findUnique({
      where: { id: params.id },
      include: {
        workshop: { select: { name: true } },
        project: { select: { name: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        orderedBy: { select: { fullName: true } },
        receivedBy: { select: { fullName: true } },
        rejectedBy: { select: { fullName: true } },
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' }, include: { createdBy: { select: { fullName: true } } } },
      },
    })
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const scope = await getUserScope(user)
    if (!canAccessWorkshopRecord(scope, request, user.id)) {
      throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')
    }

    const isRequester = request.requestedById === user.id
    const hasInvoice = Boolean(request.invoicePath)
    const canUploadInvoice =
      hasPermission(user.role, 'purchase.order') && (request.status === 'ORDERED' || request.status === 'RECEIVED')
    const paymentInfo = computePaymentInfo(request)
    const canManageFinance =
      hasPermission(user.role, 'finance.manage') && (request.status === 'ORDERED' || request.status === 'RECEIVED')

    return ok({
      request: {
        id: request.id,
        number: request.number,
        status: request.status,
        workshopId: request.workshopId,
        workshopName: request.workshop.name,
        projectId: request.projectId,
        projectName: request.project?.name ?? null,
        requestedById: request.requestedById,
        requestedByName: request.requestedBy.fullName,
        neededBy: request.neededBy?.toISOString() ?? null,
        note: request.note,
        supplierId: request.supplierId,
        supplierName: request.supplierName,
        expectedDeliveryAt: request.expectedDeliveryAt?.toISOString() ?? null,
        totalAmount: request.totalAmount != null ? request.totalAmount.toString() : null,
        orderNote: request.orderNote,
        dueDate: request.dueDate?.toISOString() ?? null,
        paymentTerms: request.paymentTerms,
        payment: paymentInfo,
        payments: request.payments.map((pay) => ({
          id: pay.id,
          amount: pay.amount.toString(),
          paidAt: pay.paidAt.toISOString(),
          method: pay.method,
          referenceNo: pay.referenceNo,
          note: pay.note,
          createdByName: pay.createdBy.fullName,
        })),
        hasInvoice,
        invoiceFileName: request.invoiceFileName,
        invoiceMimeType: request.invoiceMimeType,
        invoiceSize: request.invoiceSize,
        invoiceUrl: hasInvoice ? `/api/v1/purchase-requests/${request.id}/invoice/file` : null,
        items: request.items.map((i) => ({
          id: i.id,
          materialId: i.materialId,
          materialName: i.materialName,
          quantity: i.quantity,
          unit: i.unit,
          note: i.note,
          sortOrder: i.sortOrder,
        })),
        approvedByName: request.approvedBy?.fullName ?? null,
        approvedAt: request.approvedAt?.toISOString() ?? null,
        orderedByName: request.orderedBy?.fullName ?? null,
        orderedAt: request.orderedAt?.toISOString() ?? null,
        receivedByName: request.receivedBy?.fullName ?? null,
        receivedAt: request.receivedAt?.toISOString() ?? null,
        rejectedByName: request.rejectedBy?.fullName ?? null,
        rejectedAt: request.rejectedAt?.toISOString() ?? null,
        rejectReason: request.rejectReason,
        createdAt: request.createdAt.toISOString(),
        canEdit:
          isRequester &&
          request.status === 'PENDING' &&
          hasPermission(user.role, 'purchase.create'),
        canApprove: hasPermission(user.role, 'purchase.approve') && request.status === 'PENDING',
        canOrder: hasPermission(user.role, 'purchase.order') && request.status === 'APPROVED',
        canReceive: hasPermission(user.role, 'purchase.receive') && request.status === 'ORDERED',
        canUploadInvoice,
        canManageFinance,
        canDelete: isRequester && request.status === 'PENDING' && hasPermission(user.role, 'purchase.create'),
      },
    })
  },
  { permission: 'purchase.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'purchases' } }
)

// ─────────────────────────── PATCH /api/v1/purchase-requests/[id] — ویرایش درخواست در انتظار ───────────────────────────

export const PATCH = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const existing = await db.purchaseRequest.findUnique({ where: { id: params.id }, include: { items: true } })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const isRequester = existing.requestedById === user.id
    if (!isRequester || !hasPermission(user.role, 'purchase.create')) {
      throw new ApiError(403, 'FORBIDDEN', 'فقط ثبت‌کنندهٔ درخواست می‌تواند آن را ویرایش کند.')
    }
    if (existing.status !== 'PENDING') {
      throw new ApiError(423, 'PURCHASE_NOT_EDITABLE', 'فقط درخواست در انتظار تأیید قابل ویرایش است.')
    }

    await db.$transaction(async (tx) => {
      await tx.purchaseRequest.update({
        where: { id: existing.id },
        data: {
          projectId: body.projectId !== undefined ? body.projectId : undefined,
          neededBy:
            body.neededBy !== undefined
              ? body.neededBy
                ? tehranDayStart(body.neededBy)
                : null
              : undefined,
          note: body.note !== undefined ? body.note : undefined,
        },
      })

      if (body.items !== undefined) {
        await tx.purchaseRequestItem.deleteMany({ where: { requestId: existing.id } })
        for (const [idx, it] of body.items.entries()) {
          await tx.purchaseRequestItem.create({
            data: {
              requestId: existing.id,
              materialId: it.materialId ?? null,
              materialName: it.materialName,
              quantity: it.quantity,
              unit: it.unit,
              note: it.note ?? null,
              sortOrder: it.sortOrder ?? idx,
            },
          })
        }
      }
    })

    await writeAudit({
      user,
      action: 'EDIT_PURCHASE_REQUEST',
      entityType: 'PurchaseRequest',
      entityId: existing.id,
      oldValue: { number: existing.number, itemsCount: existing.items.length },
      newValue: { itemsCount: body.items?.length ?? existing.items.length },
      ip,
      userAgent,
    })

    return ok({ updated: true })
  },
  {
    permission: 'purchase.create',
    schema: updatePurchaseSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' },
  }
)

// ─────────────────────────── DELETE /api/v1/purchase-requests/[id] — حذف درخواست در انتظار ───────────────────────────

export const DELETE = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const existing = await db.purchaseRequest.findUnique({ where: { id: params.id } })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'درخواست خرید یافت نشد.')

    const isRequester = existing.requestedById === user.id
    if (!isRequester || !hasPermission(user.role, 'purchase.create')) {
      throw new ApiError(403, 'FORBIDDEN', 'فقط ثبت‌کنندهٔ درخواست می‌تواند آن را حذف کند.')
    }
    if (existing.status !== 'PENDING') {
      throw new ApiError(423, 'PURCHASE_NOT_DELETABLE', 'فقط درخواست در انتظار تأیید قابل حذف است.')
    }

    await db.purchaseRequest.delete({ where: { id: existing.id } })

    await writeAudit({
      user,
      action: 'DELETE_PURCHASE_REQUEST',
      entityType: 'PurchaseRequest',
      entityId: existing.id,
      oldValue: { number: existing.number, status: existing.status },
      ip,
      userAgent,
    })

    return ok({ deleted: true })
  },
  { permission: 'purchase.create', rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' } }
)

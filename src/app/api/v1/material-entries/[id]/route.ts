import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { canAccessEntry } from '@/lib/scope'
import { hasPermission } from '@/lib/permissions'
import { isLocked } from '@/lib/entry-rules'
import { canDirectEdit, canRequestCorrection, canResubmit, statusHint } from '@/lib/entry-rules'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function loadEntryForUser(id: string, user: { id: string; role: string; workshopId: string | null }) {
  const entry = await db.materialEntry.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      projects: { include: { project: { select: { id: true, name: true, code: true } } } },
      workers: true,
      workshop: { select: { id: true, name: true } },
      supervisor: { select: { id: true, fullName: true } },
      sourceSupplier: { select: { id: true, name: true } },
      sourceWorkshop: { select: { id: true, name: true } },
      attachments: { select: { id: true, kind: true, fileName: true, mimeType: true, size: true, version: true, replacedById: true, createdAt: true, uploadedBy: { select: { fullName: true } } } },
      versions: { orderBy: { version: 'desc' }, include: { changedBy: { select: { fullName: true } } } },
      corrections: { orderBy: { createdAt: 'desc' }, include: { requestedBy: { select: { fullName: true } } } },
      approvals: { orderBy: { decidedAt: 'desc' }, include: { decidedBy: { select: { fullName: true } } } },
      stageLogs: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { fullName: true, role: true } } }, take: 100 },
    },
  })
  // IDOR Protection: رکورد خارج از Scope = 404 (نه 403 — افشای وجود رکورد نمی‌کند)
  if (!entry || !(await canAccessEntry(user as never, entry))) {
    throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
  }
  return entry
}

export async function GET(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(async ({ user }) => {
    const { id } = await ctx.params
    let entry = await loadEntryForUser(id, user)
    // قفل‌سازی تنبل بر اساس Server Timestamp
    if (entry.status !== 'LOCKED' && isLocked(entry)) {
      await db.materialEntry.update({ where: { id }, data: { status: 'LOCKED', lockedAt: new Date() } })
      const reloaded = await loadEntryForUser(id, user)
      if (!reloaded) throw new ApiError(404, 'NOT_FOUND', 'ثبت یافت نشد.')
      entry = reloaded
    }

    return ok({
      entry: {
        ...entry,
        canEdit: hasPermission(user.role, 'entry.edit') && canDirectEdit(entry) && entry.supervisorId === user.id,
        canResubmit: hasPermission(user.role, 'entry.submit') && canResubmit(entry) && entry.supervisorId === user.id,
        canReview: hasPermission(user.role, 'entry.review') && ['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED', 'TECH_REVIEWED'].includes(entry.status),
        canTechReview: hasPermission(user.role, 'entry.techReview') && (['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED'].includes(entry.status) || entry.status === 'TECH_REVIEW'),
        canWarehouseConfirm: hasPermission(user.role, 'entry.warehouse') && ['APPROVED', 'LOCKED'].includes(entry.status),
        canDeliver: hasPermission(user.role, 'entry.warehouse') && entry.status === 'WAREHOUSE_CONFIRMED',
        canClose: hasPermission(user.role, 'entry.close') && entry.status === 'DELIVERED',
        canRollback: hasPermission(user.role, 'entry.rollback') && ['CLOSED', 'DELIVERED', 'WAREHOUSE_CONFIRMED', 'APPROVED', 'TECH_REVIEWED', 'TECH_REVIEW'].includes(entry.status),
        canRequestCorrection: hasPermission(user.role, 'entry.correction.request') && canRequestCorrection(entry) && entry.supervisorId === user.id,
        hint: statusHint(entry),
      },
    })
  })(req, ctx)
}

// ─────────────────────────── PATCH — ویرایش (قانون ۲۴ ساعت در سرور) ───────────────────────────

const updateSchema = (await import('@/lib/validate')).updateEntrySchema

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const entry = await db.materialEntry.findUnique({ where: { id }, include: { items: true, projects: true, workers: true } })
      if (!entry || !(await canAccessEntry(user, entry))) {
        throw new ApiError(404, 'NOT_FOUND', 'این ثبت یافت نشد یا به آن دسترسی ندارید.')
      }
      if (entry.supervisorId !== user.id && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
        throw new ApiError(403, 'FORBIDDEN', 'فقط سرپرستِ ثبت‌کننده می‌تواند این ثبت را ویرایش کند.')
      }

      const input = body
      // تاریخ ورود — همان قواعد POST (حداکثر فردا)
      let deliveryAt: Date | null = null
      if (input.deliveryAt) {
        const d = new Date(`${input.deliveryAt}T00:00:00.000Z`)
        if (isNaN(d.getTime())) throw new ApiError(422, 'INVALID_DATE', 'تاریخ ورود معتبر نیست.')
        const maxAllowed = new Date(Date.now() + 36 * 60 * 60 * 1000)
        if (d.getTime() > maxAllowed.getTime()) {
          throw new ApiError(422, 'INVALID_DATE', 'تاریخ ورود نمی‌تواند در آینده باشد.')
        }
        deliveryAt = d
      }
      const snapshot = {
        type: input.type,
        sourceType: input.sourceType,
        sourceSupplierId: input.sourceSupplierId ?? null,
        sourceWorkshopId: input.sourceWorkshopId ?? null,
        sourceDescription: input.sourceDescription ?? null,
        notes: input.notes ?? null,
        hasInvoice: input.hasInvoice,
        deliveryAt: input.deliveryAt ?? null,
        items: input.items.map((it) => ({
          materialId: it.materialId ?? null,
          materialName: it.materialName,
          quantity: it.quantity,
          unit: it.unit,
          brand: it.brand ?? null,
          batchNumber: it.batchNumber ?? null,
          serialNumber: it.serialNumber ?? null,
          description: it.description ?? null,
        })),
        projects: input.projectIds,
        workers: input.workers.map((w) => ({ workerId: w.workerId ?? null, workerName: w.workerName, workerKind: w.workerKind, role: w.role ?? null })),
      }

      const { editEntryWithVersion } = await import('@/lib/workflow')
      const updated = await editEntryWithVersion(
        entry,
        snapshot,
        {
          type: input.type,
          sourceType: input.sourceType,
          sourceSupplierId: input.sourceSupplierId ?? null,
          sourceWorkshopId: input.sourceWorkshopId ?? null,
          sourceDescription: input.sourceDescription ?? null,
          notes: input.notes ?? null,
          hasInvoice: input.hasInvoice,
          deliveryAt,
        } as import('@prisma/client').Prisma.MaterialEntryUncheckedUpdateInput,
        async (tx) => {
          // بازسازی روابط — داخل همان تراکنش editEntryWithVersion
          await tx.materialEntryItem.deleteMany({ where: { entryId: id } })
          await tx.materialEntryItem.createMany({
            data: input.items.map((it, idx) => ({
              entryId: id,
              materialId: it.materialId ?? null,
              materialName: it.materialName,
              quantity: it.quantity,
              unit: it.unit,
              brand: it.brand ?? null,
              description: it.description ?? null,
              batchNumber: it.batchNumber ?? null,
              serialNumber: it.serialNumber ?? null,
              sortOrder: idx,
            })),
          })
          await tx.materialEntryProject.deleteMany({ where: { entryId: id } })
          await tx.materialEntryProject.createMany({ data: input.projectIds.map((projectId) => ({ entryId: id, projectId })) })
          await tx.materialEntryWorker.deleteMany({ where: { entryId: id } })
          await tx.materialEntryWorker.createMany({
            data: input.workers.map((w) => ({
              entryId: id,
              workerId: w.workerId ?? null,
              workerName: w.workerName,
              workerKind: w.workerKind,
              role: w.role ?? null,
            })),
          })
        },
        user,
        'ویرایش ثبت',
        ip,
        userAgent
      )

      return ok({ id: updated.id, currentVersion: updated.currentVersion, status: updated.status })
    },
    { permission: 'entry.edit', schema: updateSchema }
  )(req, ctx)
}

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, workshopOrProjectScopeFilter } from '@/lib/scope'
import { createPurchaseSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { tehranDayStart } from '@/lib/daily'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/purchase-requests — فهرست درخواست‌های خرید ───────────────────────────

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)

    const url = req.nextUrl
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '15') || 15))
    const status = url.searchParams.get('status')
    const workshopId = url.searchParams.get('workshopId')
    const projectId = url.searchParams.get('projectId')
    const q = url.searchParams.get('q')?.trim()

    const and: Prisma.PurchaseRequestWhereInput[] = [workshopOrProjectScopeFilter(scope) as Prisma.PurchaseRequestWhereInput]

    if (status) {
      const list = status.split(',').map((s) => s.trim()).filter(Boolean)
      if (list.length > 0) and.push({ status: { in: list } })
    }
    if (workshopId) and.push({ workshopId })
    if (projectId) and.push({ projectId })
    if (q) and.push({ items: { some: { materialName: { contains: q } } } })

    const where: Prisma.PurchaseRequestWhereInput = { AND: and }

    const [total, requests] = await Promise.all([
      db.purchaseRequest.count({ where }),
      db.purchaseRequest.findMany({
        where,
        include: {
          workshop: { select: { name: true } },
          project: { select: { name: true } },
          requestedBy: { select: { id: true, fullName: true } },
          items: { orderBy: { sortOrder: 'asc' as const }, take: 3 },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    // هشدار «درخواست بی‌پاسخ» — PENDING بیش از ۲۴ ساعت بدون بررسی مدیر
    const staleBefore = Date.now() - 24 * 60 * 60 * 1000

    return ok({
      requests: requests.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        workshopId: r.workshopId,
        workshopName: r.workshop.name,
        projectId: r.projectId,
        projectName: r.project?.name ?? null,
        requestedById: r.requestedById,
        requestedByName: r.requestedBy.fullName,
        neededBy: r.neededBy?.toISOString() ?? null,
        note: r.note,
        supplierName: r.supplierName,
        hasInvoice: Boolean(r.invoicePath),
        isStale: r.status === 'PENDING' && r.createdAt.getTime() < staleBefore,
        itemsCount: r.items.length,
        itemsPreview: r.items.map((i) => i.materialName).join('، '),
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  },
  { permission: 'purchase.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'purchases' } }
)

// ─────────────────────────── POST /api/v1/purchase-requests — اعلام نیاز (انباردار) ───────────────────────────

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const { workshopId, projectId, neededBy, note, items } = body
    const scope = await getUserScope(user)

    if (!scope.isGlobal && !scope.workshopIds.includes(workshopId)) {
      throw new ApiError(403, 'FORBIDDEN', 'به این کارگاه دسترسی ندارید.')
    }
    if (projectId) {
      const projectBelongs = await db.project.findFirst({
        where: { id: projectId, workshopId },
        select: { id: true },
      })
      if (!projectBelongs) throw new ApiError(422, 'INVALID_PROJECT', 'پروژهٔ انتخاب‌شده به این کارگاه تعلق ندارد.')
    }

    const created = await db.$transaction(async (tx) => {
      const last = await tx.purchaseRequest.findFirst({ orderBy: { number: 'desc' }, select: { number: true } })
      const nextNumber = (last?.number ?? 0) + 1
      return tx.purchaseRequest.create({
        data: {
          number: nextNumber,
          workshopId,
          projectId: projectId ?? null,
          requestedById: user.id,
          neededBy: neededBy ? tehranDayStart(neededBy) : null,
          note: note ?? null,
          status: 'PENDING',
          items: {
            create: items.map((it, idx) => ({
              materialId: it.materialId ?? null,
              materialName: it.materialName,
              quantity: it.quantity,
              unit: it.unit,
              note: it.note ?? null,
              sortOrder: it.sortOrder ?? idx,
            })),
          },
        },
      })
    }).catch(async (err: unknown) => {
      const code = (err as { code?: string })?.code
      if (code !== 'P2002') throw err
      const last = await db.purchaseRequest.findFirst({ orderBy: { number: 'desc' }, select: { number: true } })
      return db.purchaseRequest.create({
        data: {
          number: (last?.number ?? 0) + 1,
          workshopId,
          projectId: projectId ?? null,
          requestedById: user.id,
          neededBy: neededBy ? tehranDayStart(neededBy) : null,
          note: note ?? null,
          status: 'PENDING',
          items: {
            create: items.map((it, idx) => ({
              materialId: it.materialId ?? null,
              materialName: it.materialName,
              quantity: it.quantity,
              unit: it.unit,
              note: it.note ?? null,
              sortOrder: it.sortOrder ?? idx,
            })),
          },
        },
      })
    })

    await writeAudit({
      user,
      action: 'CREATE_PURCHASE_REQUEST',
      entityType: 'PurchaseRequest',
      entityId: created.id,
      newValue: { number: created.number, itemsCount: items.length },
      ip,
      userAgent,
    })

    // اعلان به مدیران برای تأیید نیاز
    const approvers = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: ['WORKSHOP_MANAGER', 'PROJECT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      },
      select: { id: true },
    })
    await notifyUsers({
      userIds: approvers.map((a) => a.id),
      type: 'PURCHASE_REQUESTED',
      title: 'اعلام نیاز جدید در انتظار تأیید',
      body: `انباردار «${user.fullName}» درخواست خرید شمارهٔ ${created.number.toLocaleString('fa-IR')} را با ${items.length.toLocaleString('fa-IR')} قلم ثبت کرد.`,
      entityId: created.id,
      entityType: 'PurchaseRequest',
    })

    return ok({ requestId: created.id, number: created.number }, { status: 201 })
  },
  {
    permission: 'purchase.create',
    schema: createPurchaseSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'purchases-write' },
  }
)

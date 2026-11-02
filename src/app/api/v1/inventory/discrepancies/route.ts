import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { discrepancyCreateSchema } from '@/lib/validate'
import { notifyUsers } from '@/lib/notify'
import { DISCREPANCY_KINDS } from '@/lib/permissions'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── اعلام کمبود/مغایرت انبار ───────────────────────────
// انباردار کمبود یا مغایرت شمارش را اعلام می‌کند؛
// سرپرستان همان کارگاه + مدیران مرتبط نوتیف می‌شوند.

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)
    const url = req.nextUrl
    const status = url.searchParams.get('status') // OPEN | RESOLVED
    const workshopId = url.searchParams.get('workshopId')

    const and: Prisma.StockDiscrepancyWhereInput[] = []
    // اسکوپ — انباردار/سرپرست فقط کارگاه‌های خودش؛ مدیر پروژه همه
    if (!scope.isGlobal) {
      if (scope.workshopIds.length === 0) {
        and.push({ id: { in: ['__no_access__'] } })
      } else {
        and.push({ workshopId: { in: scope.workshopIds } })
      }
    }
    if (status === 'OPEN' || status === 'RESOLVED') and.push({ status })
    if (workshopId) and.push({ workshopId })

    const where: Prisma.StockDiscrepancyWhereInput = { AND: and }

    const [total, items] = await Promise.all([
      db.stockDiscrepancy.count({ where }),
      db.stockDiscrepancy.findMany({
        where,
        include: {
          workshop: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          createdBy: { select: { fullName: true } },
          resolvedBy: { select: { fullName: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 50,
      }),
    ])

    return ok({
      discrepancies: items.map((d) => ({
        id: d.id,
        workshopId: d.workshopId,
        workshopName: d.workshop.name,
        projectId: d.projectId,
        projectName: d.project?.name ?? null,
        stockId: d.stockId,
        materialName: d.materialName,
        unit: d.unit,
        systemQty: d.systemQty,
        actualQty: d.actualQty,
        kind: d.kind,
        note: d.note,
        status: d.status,
        resolveNote: d.resolveNote,
        resolvedByName: d.resolvedBy?.fullName ?? null,
        resolvedAt: d.resolvedAt?.toISOString() ?? null,
        createdByName: d.createdBy.fullName,
        createdAt: d.createdAt.toISOString(),
      })),
      pagination: { page: 1, pageSize: 50, total, totalPages: 1 },
    })
  },
  { permission: 'inventory.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'inventory' } }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const scope = await getUserScope(user)
    if (!scope.isGlobal && !scope.workshopIds.includes(body.workshopId)) {
      throw new ApiError(403, 'FORBIDDEN', 'به این کارگاه دسترسی ندارید.')
    }

    if (body.projectId) {
      const project = await db.project.findUnique({ where: { id: body.projectId }, select: { workshopId: true, isActive: true } })
      if (!project || !project.isActive) throw new ApiError(422, 'INVALID_PROJECT', 'پروژهٔ انتخاب‌شده معتبر نیست.')
      if (project.workshopId && project.workshopId !== body.workshopId) {
        throw new ApiError(422, 'INVALID_PROJECT', 'پروژهٔ انتخاب‌شده به این کارگاه تعلق ندارد.')
      }
    }

    const created = await db.stockDiscrepancy.create({
      data: {
        workshopId: body.workshopId,
        projectId: body.projectId || null,
        stockId: body.stockId || null,
        materialName: body.materialName,
        unit: body.unit,
        systemQty: body.systemQty ?? null,
        actualQty: body.actualQty ?? null,
        kind: body.kind,
        note: body.note ?? null,
        createdById: user.id,
      },
    })

    await writeAudit({
      user,
      action: 'DECLARE_DISCREPANCY',
      entityType: 'StockDiscrepancy',
      entityId: created.id,
      newValue: { kind: created.kind, materialName: created.materialName, workshopId: created.workshopId },
      ip,
      userAgent,
    })

    // اعلان به سرپرستان کارگاه + مدیران مرتبط — مغایرت باید فوراً دیده شود
    const supervisors = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: ['SITE_SUPERVISOR', 'PROJECT_MANAGER'] },
        OR: [
          { workshopId: body.workshopId },
          { userWorkshops: { some: { workshopId: body.workshopId } } },
        ],
      },
      select: { id: true },
    })
    const kindLabel = DISCREPANCY_KINDS[created.kind as keyof typeof DISCREPANCY_KINDS] ?? created.kind
    await notifyUsers({
      userIds: supervisors.map((s) => s.id),
      type: 'STOCK_DISCREPANCY',
      title: kindLabel,
      body: `انباردار «${user.fullName}» ${kindLabel} برای «${created.materialName}» را اعلام کرد. لطفاً بررسی کنید.`,
      entityId: created.id,
      entityType: 'StockDiscrepancy',
    })

    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'inventory.discrepancy', schema: discrepancyCreateSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'inventory-write' } }
)

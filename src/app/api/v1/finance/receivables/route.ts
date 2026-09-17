import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, workshopOrProjectScopeFilter } from '@/lib/scope'
import { createReceivableSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { tehranDayStart } from '@/lib/daily'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/finance/receivables — طلب‌های شرکت از کارفرماها ───────────────────────────

export const GET = apiHandler(
  async ({ req, user }) => {
    const scope = await getUserScope(user)
    const url = req.nextUrl
    const status = url.searchParams.get('status')
    const workshopId = url.searchParams.get('workshopId')
    const projectId = url.searchParams.get('projectId')

    const and: Prisma.ReceivableWhereInput[] = [workshopOrProjectScopeFilter(scope) as Prisma.ReceivableWhereInput]
    if (status) and.push({ status })
    if (workshopId) and.push({ workshopId })
    if (projectId) and.push({ projectId })

    const where: Prisma.ReceivableWhereInput = { AND: and }

    const [total, receivables] = await Promise.all([
      db.receivable.count({ where }),
      db.receivable.findMany({
        where,
        include: {
          workshop: { select: { name: true } },
          project: { select: { name: true } },
          createdBy: { select: { fullName: true } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      }),
    ])

    const now = Date.now()
    return ok({
      receivables: receivables.map((r) => ({
        id: r.id,
        title: r.title,
        amount: r.amount.toString(),
        workshopId: r.workshopId,
        workshopName: r.workshop.name,
        projectId: r.projectId,
        projectName: r.project?.name ?? null,
        dueDate: r.dueDate?.toISOString() ?? null,
        status: r.status,
        settledAt: r.settledAt?.toISOString() ?? null,
        isOverdue: r.status === 'OPEN' && r.dueDate != null && r.dueDate.getTime() < now,
        note: r.note,
        createdByName: r.createdBy.fullName,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    })
  },
  { permission: 'finance.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'finance' } }
)

// ─────────────────────────── POST /api/v1/finance/receivables — ثبت طلب جدید ───────────────────────────

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const { workshopId, projectId, title, amount, dueDate, note } = body
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

    const created = await db.receivable.create({
      data: {
        workshopId,
        projectId: projectId ?? null,
        title,
        amount: BigInt(Math.round(amount)),
        dueDate: dueDate ? tehranDayStart(dueDate) : null,
        note: note ?? null,
        status: 'OPEN',
        createdById: user.id,
      },
    })

    await writeAudit({
      user,
      action: 'CREATE_RECEIVABLE',
      entityType: 'Receivable',
      entityId: created.id,
      newValue: { title, amount: created.amount.toString() },
      ip,
      userAgent,
    })

    // اعلان به مدیر کل — طلب جدید ثبت شد
    const gms = await db.user.findMany({
      where: { isActive: true, role: { in: ['GENERAL_MANAGER', 'ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    })
    await notifyUsers({
      userIds: gms.filter((g) => g.id !== user.id).map((g) => g.id),
      type: 'RECEIVABLE_CREATED',
      title: 'طلب جدید ثبت شد',
      body: `طلب «${title}» به مبلغ ${created.amount.toLocaleString('fa-IR')} تومان توسط «${user.fullName}» ثبت شد.`,
      entityId: created.id,
      entityType: 'Receivable',
    })

    return ok({ receivableId: created.id }, { status: 201 })
  },
  { permission: 'finance.manage', schema: createReceivableSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'finance-write' } }
)

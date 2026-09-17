import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, workshopOrProjectScopeFilter } from '@/lib/scope'
import { createStatementSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { GM_SIGN_THRESHOLD_TOMAN } from '@/lib/permissions'
import type { Prisma } from '@prisma/client'

// ─────────────────────────── GET /api/v1/statements — فهرست صورت وضعیت‌ها ───────────────────────────

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

    const and: Prisma.ProgressStatementWhereInput[] = [workshopOrProjectScopeFilter(scope) as Prisma.ProgressStatementWhereInput]

    if (status) {
      const list = status.split(',').map((s) => s.trim()).filter(Boolean)
      if (list.length > 0) and.push({ status: { in: list } })
    }
    if (workshopId) and.push({ workshopId })
    if (projectId) and.push({ projectId })
    if (q) and.push({ title: { contains: q } })

    const where: Prisma.ProgressStatementWhereInput = { AND: and }

    const [total, statements] = await Promise.all([
      db.progressStatement.count({ where }),
      db.progressStatement.findMany({
        where,
        include: {
          workshop: { select: { name: true } },
          project: { select: { name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return ok({
      statements: statements.map((s) => ({
        id: s.id,
        number: s.number,
        title: s.title,
        status: s.status,
        amount: s.amount.toString(),
        needsGmSign: s.needsGmSign,
        workshopId: s.workshopId,
        workshopName: s.workshop.name,
        projectId: s.projectId,
        projectName: s.project?.name ?? null,
        periodText: s.periodText,
        createdById: s.createdById,
        createdByName: s.createdBy.fullName,
        submittedAt: s.submittedAt?.toISOString() ?? null,
        signedAt: s.signedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      role: user.role,
    })
  },
  { permission: 'statement.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'statements' } }
)

// ─────────────────────────── POST /api/v1/statements — ایجاد صورت وضعیت (پیش‌نویس) ───────────────────────────

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const { workshopId, projectId, title, periodText, amount, description } = body
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

    const amountBigInt = BigInt(Math.round(amount))

    const created = await db.$transaction(async (tx) => {
      const last = await tx.progressStatement.findFirst({ orderBy: { number: 'desc' }, select: { number: true } })
      const nextNumber = (last?.number ?? 0) + 1
      return tx.progressStatement.create({
        data: {
          number: nextNumber,
          title,
          workshopId,
          projectId: projectId ?? null,
          periodText: periodText ?? null,
          amount: amountBigInt,
          description: description ?? null,
          status: 'DRAFT',
          needsGmSign: amountBigInt > BigInt(GM_SIGN_THRESHOLD_TOMAN),
          createdById: user.id,
        },
      })
    }).catch(async (err: unknown) => {
      // برخورد شمارهٔ یکتا — یک بار تلاش مجدد (تراکنش هم‌زمان)
      const code = (err as { code?: string })?.code
      if (code !== 'P2002') throw err
      const last = await db.progressStatement.findFirst({ orderBy: { number: 'desc' }, select: { number: true } })
      return db.progressStatement.create({
        data: {
          number: (last?.number ?? 0) + 1,
          title,
          workshopId,
          projectId: projectId ?? null,
          periodText: periodText ?? null,
          amount: amountBigInt,
          description: description ?? null,
          status: 'DRAFT',
          needsGmSign: amountBigInt > BigInt(GM_SIGN_THRESHOLD_TOMAN),
          createdById: user.id,
        },
      })
    })

    await writeAudit({
      user,
      action: 'CREATE_STATEMENT',
      entityType: 'ProgressStatement',
      entityId: created.id,
      newValue: { number: created.number, title, amount: amountBigInt.toString() },
      ip,
      userAgent,
    })

    return ok({ statementId: created.id, number: created.number }, { status: 201 })
  },
  {
    permission: 'statement.create',
    schema: createStatementSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'statements-write' },
  }
)

import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, entryScopeFilter } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { buildSnapshot } from '@/lib/workflow'
import { createEntrySchema } from '@/lib/validate'

// ─────────────────────────── GET /material-entries — لیست با Pagination و فیلتر ───────────────────────────

export const GET = apiHandler(async ({ req, user }) => {
  const url = req.nextUrl
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get('pageSize') ?? '20') || 20))
  const status = url.searchParams.get('status') ?? ''
  const type = url.searchParams.get('type') ?? ''
  const q = (url.searchParams.get('q') ?? '').trim()
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  const scope = await getUserScope(user)

  // فیلتر بازهٔ تاریخ — روی تاریخ ورود؛ ثبت‌های بدون تاریخ ورود با تاریخ ایجاد
  const dateFilter =
    /^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)
    ? {
        OR: [
          {
            deliveryAt: {
              ...( /^\d{4}-\d{2}-\d{2}$/.test(from) ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...( /^\d{4}-\d{2}-\d{2}$/.test(to) ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          },
          {
            AND: [
              { deliveryAt: null },
              {
                createdAt: {
                  ...( /^\d{4}-\d{2}-\d{2}$/.test(from) ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                  ...( /^\d{4}-\d{2}-\d{2}$/.test(to) ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
                },
              },
            ],
          },
        ],
      }
    : null

  const where = {
    AND: [
      entryScopeFilter(scope),
      ...(dateFilter ? [dateFilter] : []),
      ...(status && status !== 'ALL' ? [{ status }] : []),
      ...(type && type !== 'ALL' ? [{ type }] : []),
      // فقط ثبت‌های Submit شده + پیش‌نویس‌های خود کاربر
      ...(user.role === 'WORKSHOP_SUPERVISOR' ? [{ OR: [{ status: { not: 'DRAFT' } }, { supervisorId: user.id }] }] : []),
      ...(q
        ? [
            {
              OR: [
                { items: { some: { materialName: { contains: q } } } },
                { sourceDescription: { contains: q } },
                { notes: { contains: q } },
                { supervisor: { fullName: { contains: q } } },
              ],
            },
          ]
        : []),
    ],
  }

  const [total, entries] = await Promise.all([
    db.materialEntry.count({ where }),
    db.materialEntry.findMany({
      where,
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        projects: { include: { project: { select: { id: true, name: true } } } },
        workshop: { select: { id: true, name: true } },
        supervisor: { select: { id: true, fullName: true } },
        sourceSupplier: { select: { id: true, name: true } },
        sourceWorkshop: { select: { id: true, name: true } },
        attachments: { select: { id: true, kind: true } },
        _count: { select: { items: true, attachments: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return ok({
    entries: entries.map((e) => ({
      id: e.id,
      entryNumber: e.entryNumber,
      type: e.type,
      status: e.status,
      workshopName: e.workshop.name,
      supervisorName: e.supervisor.fullName,
      deliveryAt: e.deliveryAt,
      source:
        e.sourceType === 'SUPPLIER'
          ? e.sourceSupplier?.name ?? null
          : e.sourceType === 'WORKSHOP'
            ? e.sourceWorkshop?.name ?? null
            : e.sourceDescription,
      sourceType: e.sourceType,
      projects: e.projects.map((p) => ({ id: p.project.id, name: p.project.name })),
      items: e.items.map((i) => ({ materialName: i.materialName, quantity: i.quantity, unit: i.unit })),
      hasInvoice: e.hasInvoice,
      attachmentsCount: e.attachments.length,
      submittedAt: e.submittedAt,
      decidedAt: e.decidedAt,
      decisionNote: e.decisionNote,
      currentVersion: e.currentVersion,
      createdAt: e.createdAt,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  })
})

// ─────────────────────────── POST /material-entries — ایجاد ثبت (تراکنشی) ───────────────────────────

// SQLite تک‌نویسنده است: تراکنش‌های هم‌زمان روی قفل صبر می‌کنند و Timeout می‌خورند.
// صف درون‌پروسه‌ای ایجاد ثبت را سری‌سازی می‌کند (چندنمونه‌ای → سند POSTGRES-MIGRATION).
let createChain: Promise<unknown> = Promise.resolve()
function withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = createChain.then(fn, fn)
  createChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function isRetryableTxError(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: string }).code) : ''
  if (code === 'P2002' || code === 'P2024') return true
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('Transaction already closed') || msg.includes('Socket timeout') || msg.includes('database is locked')
}

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const input = body

    // Idempotency — ضد داده تکراری در Offline Sync:
    // اگر همین clientRequestId قبلاً ثبت شده، رکورد موجود برمی‌گردد (بدون ایجاد رکورد دوم)
    if (input.clientRequestId) {
      const existing = await db.materialEntry.findUnique({ where: { clientRequestId: input.clientRequestId } })
      if (existing && existing.supervisorId === user.id) {
        return ok({ id: existing.id, entryNumber: existing.entryNumber, status: existing.status, duplicate: true }, { status: 200 })
      }
      if (existing) {
        throw new ApiError(409, 'CLIENT_REQUEST_CONFLICT', 'این شناسهٔ درخواست قبلاً توسط کاربر دیگری استفاده شده است.')
      }
    }

    // workshopId از Session — قابل جعل از Frontend نیست
    const scope = await getUserScope(user)
    const effectiveWorkshopId = user.workshopId ?? scope.workshopIds[0]
    if (!effectiveWorkshopId) {
      throw new ApiError(403, 'NO_WORKSHOP', 'کارگاه شما مشخص نیست. با مدیر سیستم تماس بگیرید.')
    }
    const projectIds = input.projectIds
    if (!scope.isGlobal) {
      const allowedProjects = scope.projectIds ?? (
        await db.project.findMany({ where: { workshopId: { in: scope.workshopIds } }, select: { id: true } })
      ).map((p) => p.id)
      const invalid = projectIds.filter((pid) => !allowedProjects.includes(pid))
      if (invalid.length > 0) {
        throw new ApiError(403, 'FORBIDDEN_PROJECT', 'به یکی از پروژه‌های انتخاب‌شده دسترسی ندارید.')
      }
    }
    if (input.sourceType === 'SUPPLIER' && input.sourceSupplierId) {
      const supplier = await db.supplier.findFirst({ where: { id: input.sourceSupplierId, ...(!scope.isGlobal ? { workshopId: { in: scope.workshopIds } } : {}) } })
      if (!supplier) throw new ApiError(403, 'FORBIDDEN_SUPPLIER', 'تأمین‌کننده انتخاب‌شده معتبر نیست.')
    }
    if (input.sourceType === 'WORKSHOP' && input.sourceWorkshopId) {
      const ws = await db.workshop.findUnique({ where: { id: input.sourceWorkshopId } })
      if (!ws) throw new ApiError(422, 'INVALID_SOURCE', 'کارگاه مبدأ معتبر نیست.')
    }

    // تاریخ ورود — اعتبارسنجی سمت سرور: حداکثر فردا (تحمل اختلاف منطقهٔ زمانی تهران)
    let deliveryAt: Date | null = null
    if (input.deliveryAt) {
      const d = new Date(`${input.deliveryAt}T00:00:00.000Z`)
      if (isNaN(d.getTime())) throw new ApiError(422, 'INVALID_DATE', 'تاریخ ورود معتبر نیست.')
      const maxAllowed = new Date(Date.now() + 36 * 60 * 60 * 1000) // امروز سرور + تحمل ۳:۳۰ + یک روز
      if (d.getTime() > maxAllowed.getTime()) {
        throw new ApiError(422, 'INVALID_DATE', 'تاریخ ورود نمی‌تواند در آینده باشد.')
      }
      deliveryAt = d
    }

    const hasInvoice = input.hasInvoice
    const submitNow = input.status === 'SUBMITTED'
    const now = new Date()

    // تولید شماره ثبت اتمیک: findFirst+1 داخل تراکنش؛ در صورت تداخل هم‌زمانی
    // (P2002 از Unique Index روی entryNumber) تراکنش از نو تلاش می‌شود.
    const MAX_ATTEMPTS = 5
    let lastConflict: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const entry = await withCreateLock(() => db.$transaction(async (tx) => {
        // شماره ثبت اتمی
        const last = await tx.materialEntry.findFirst({ orderBy: { entryNumber: 'desc' }, select: { entryNumber: true } })
        const entryNumber = (last?.entryNumber ?? 0) + 1

        const created = await tx.materialEntry.create({
          data: {
            entryNumber,
            type: input.type,
            status: submitNow ? 'SUBMITTED' : 'DRAFT',
            workshopId: effectiveWorkshopId,
            supervisorId: user.id,
            clientRequestId: input.clientRequestId ?? null,
            sourceType: input.sourceType,
            sourceSupplierId: input.sourceSupplierId ?? null,
            sourceWorkshopId: input.sourceWorkshopId ?? null,
            sourceDescription: input.sourceDescription ?? null,
            notes: input.notes ?? null,
            hasInvoice,
            deliveryAt,
            submittedAt: submitNow ? now : null,
            editDeadline: submitNow ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
            items: {
              create: input.items.map((it, idx) => ({
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
            },
            projects: { create: input.projectIds.map((projectId) => ({ projectId })) },
            workers: {
              create: input.workers.map((w) => ({
                workerId: w.workerId ?? null,
                workerName: w.workerName,
                workerKind: w.workerKind,
                role: w.role ?? null,
              })),
            },
          },
        })

        // نسخه ۱ — همیشه
        await tx.materialEntryVersion.create({
          data: {
            entryId: created.id,
            version: 1,
            snapshotJson: JSON.stringify(
              buildSnapshot(
                created,
                input.items.map((it) => ({
                  materialId: it.materialId ?? null,
                  materialName: it.materialName,
                  quantity: it.quantity,
                  unit: it.unit,
                  brand: it.brand ?? null,
                  batchNumber: it.batchNumber ?? null,
                  serialNumber: it.serialNumber ?? null,
                  description: it.description ?? null,
                })),
                input.projectIds,
                input.workers.map((w) => ({ workerId: w.workerId ?? null, workerName: w.workerName, workerKind: w.workerKind, role: w.role ?? null }))
              )
            ),
            changedById: user.id,
            changeReason: 'ایجاد اولیه',
          },
        })

        return created
        }))

      await writeAudit({
        user,
        action: 'CREATE',
        entityType: 'MaterialEntry',
        entityId: entry.id,
        newValue: { entryNumber: entry.entryNumber, type: entry.type, status: entry.status, source: 'MANUAL' },
        ip,
        userAgent,
      })

      if (entry.status === 'SUBMITTED') {
        await db.entryStageLog
          .create({ data: { entryId: entry.id, stage: 'SUBMITTED', action: 'SUBMIT', actorId: user.id } })
          .catch(() => undefined)
      }

      return ok({ id: entry.id, entryNumber: entry.entryNumber, status: entry.status, duplicate: false }, { status: 201 })
      } catch (err) {
        if (!isRetryableTxError(err) || attempt === MAX_ATTEMPTS) throw err
        lastConflict = err
        // Backoff کوتاه تصادفی برای شکستن هم‌زمانی
        await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 80)))
      }
    }
    // unreachable — اما برای type-safety
    throw lastConflict ?? new ApiError(500, 'INTERNAL_ERROR', 'خطای غیرمنتظره‌ای رخ داد.')
  },
  {
    permission: 'entry.create',
    schema: createEntrySchema,
    rateLimit: { limit: 60, windowMs: 60_000, scope: 'entry-write' },
  }
)

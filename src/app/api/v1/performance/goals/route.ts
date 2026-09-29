import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { upsertWorkerGoalSchema, type UpsertWorkerGoalInput } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

// ─────────────────────────── POST /api/v1/performance/goals — تعیین/ویرایش هدف ماهانهٔ نیرو ───────────────────────────
// KPI سند سیستم یکپارچه: هدف ماهانه = تعداد گزارش کار مورد انتظار؛ درصد تحقق در صفحهٔ ارزیابی محاسبه می‌شود.

export const POST = apiHandler<UpsertWorkerGoalInput>(
  async ({ user, body, ip, userAgent }) => {
    const scope = await getUserScope(user)
    const { workerId, period, targetReports, note } = body

    const worker = await db.worker.findUnique({ where: { id: workerId } })
    if (!worker) throw new ApiError(404, 'NOT_FOUND', 'نیروی انسانی یافت نشد.')

    // Scope — فقط نیروهای حوزهٔ خودشان
    if (!scope.isGlobal) {
      let allowed = worker.workshopId != null && scope.workshopIds.includes(worker.workshopId)
      if (!allowed && scope.projectIds && scope.projectIds.length > 0) {
        const linked = await db.workReport.findFirst({
          where: { workerId: worker.id, projectId: { in: scope.projectIds } },
          select: { id: true },
        })
        allowed = Boolean(linked)
      }
      if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'به این نیرو دسترسی ندارید.')
    }

    const goal = await db.workerGoal.upsert({
      where: { workerId_period: { workerId, period } },
      create: { workerId, period, targetReports, note: note ?? null, createdById: user.id },
      update: { targetReports, note: note ?? null },
    })

    await writeAudit({
      user,
      action: 'UPSERT_WORKER_GOAL',
      entityType: 'WorkerGoal',
      entityId: goal.id,
      newValue: { workerId, period, targetReports },
      ip,
      userAgent,
    })

    return ok({ goalId: goal.id }, { status: 201 })
  },
  { permission: 'performance.manage', schema: upsertWorkerGoalSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'performance-write' } }
)

// ─────────────────────────── DELETE /api/v1/performance/goals?id= — حذف هدف ماهانه ───────────────────────────

export const DELETE = apiHandler(
  async ({ req, user, ip, userAgent }) => {
    const goalId = req.nextUrl.searchParams.get('id')
    if (!goalId) throw new ApiError(422, 'MISSING_ID', 'شناسهٔ هدف ارسال نشده است.')

    const goal = await db.workerGoal.findUnique({ where: { id: goalId } })
    if (!goal) throw new ApiError(404, 'NOT_FOUND', 'هدف یافت نشد.')

    const scope = await getUserScope(user)
    if (!scope.isGlobal) {
      const worker = await db.worker.findUnique({ where: { id: goal.workerId }, select: { workshopId: true } })
      const allowed =
        (worker?.workshopId != null && scope.workshopIds.includes(worker.workshopId)) ||
        (scope.projectIds && scope.projectIds.length > 0
          ? Boolean(
              await db.workReport.findFirst({
                where: { workerId: goal.workerId, projectId: { in: scope.projectIds } },
                select: { id: true },
              })
            )
          : false)
      if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'به این هدف دسترسی ندارید.')
    }

    await db.workerGoal.delete({ where: { id: goalId } })

    await writeAudit({
      user,
      action: 'DELETE_WORKER_GOAL',
      entityType: 'WorkerGoal',
      entityId: goalId,
      oldValue: { workerId: goal.workerId, period: goal.period, targetReports: goal.targetReports },
      ip,
      userAgent,
    })

    return ok({ deleted: true })
  },
  { permission: 'performance.manage', rateLimit: { limit: 30, windowMs: 60_000, scope: 'performance-write' } }
)

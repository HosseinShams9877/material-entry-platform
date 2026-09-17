import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { patchReceivableSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ─────────────────────────── PATCH /api/v1/finance/receivables/[id] — وصول / بازگشایی طلب ───────────────────────────

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const existing = await db.receivable.findUnique({ where: { id } })
      if (!existing) throw new ApiError(404, 'NOT_FOUND', 'طلب یافت نشد.')

      const scope = await getUserScope(user)
      const inScope =
        scope.isGlobal ||
        scope.workshopIds.includes(existing.workshopId) ||
        (existing.projectId && scope.projectIds !== null && scope.projectIds.includes(existing.projectId))
      if (!inScope) throw new ApiError(404, 'NOT_FOUND', 'طلب یافت نشد.')

      const data: { status?: string; settledAt?: Date | null; note?: string | null } = {}
      if (body.status !== undefined) {
        data.status = body.status
        data.settledAt = body.status === 'SETTLED' ? new Date() : null
      }
      if (body.note !== undefined) data.note = body.note

      const updated = await db.receivable.update({ where: { id }, data })

      await writeAudit({
        user,
        action: 'PATCH_RECEIVABLE',
        entityType: 'Receivable',
        entityId: id,
        oldValue: { status: existing.status },
        newValue: { status: updated.status, amount: updated.amount.toString() },
        ip,
        userAgent,
      })

      return ok({
        id: updated.id,
        status: updated.status,
        settledAt: updated.settledAt?.toISOString() ?? null,
      })
    },
    { permission: 'finance.manage', schema: patchReceivableSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'finance-write' } }
  )(req, ctx)
}

// ─────────────────────────── DELETE /api/v1/finance/receivables/[id] — حذف طلب ───────────────────────────

export async function DELETE(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ user, params, ip, userAgent }) => {
      const { id } = params
      const existing = await db.receivable.findUnique({ where: { id } })
      if (!existing) throw new ApiError(404, 'NOT_FOUND', 'طلب یافت نشد.')

      const scope = await getUserScope(user)
      const inScope =
        scope.isGlobal ||
        scope.workshopIds.includes(existing.workshopId) ||
        (existing.projectId && scope.projectIds !== null && scope.projectIds.includes(existing.projectId))
      if (!inScope) throw new ApiError(404, 'NOT_FOUND', 'طلب یافت نشد.')

      await db.receivable.delete({ where: { id } })

      await writeAudit({
        user,
        action: 'DELETE_RECEIVABLE',
        entityType: 'Receivable',
        entityId: id,
        oldValue: { title: existing.title, amount: existing.amount.toString(), status: existing.status },
        ip,
        userAgent,
      })

      return ok({ deleted: true })
    },
    { permission: 'finance.manage', rateLimit: { limit: 30, windowMs: 60_000, scope: 'finance-write' } }
  )(req, ctx)
}

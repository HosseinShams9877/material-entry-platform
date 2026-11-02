import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { writeAudit } from '@/lib/audit'
import { discrepancyResolveSchema } from '@/lib/validate'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ─────────────────────────── برطرف‌کردن اعلام کمبود/مغایرت ───────────────────────────

export async function PATCH(req: import('next/server').NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const target = await db.stockDiscrepancy.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'اعلام مغایرت یافت نشد.')

      const scope = await getUserScope(user)
      if (!scope.isGlobal && !scope.workshopIds.includes(target.workshopId)) {
        throw new ApiError(404, 'NOT_FOUND', 'اعلام مغایرت یافت نشد.')
      }

      const resolved = await db.stockDiscrepancy.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolveNote: body.resolveNote ?? null,
          resolvedById: user.id,
          resolvedAt: new Date(),
        },
      })

      await writeAudit({
        user,
        action: 'RESOLVE_DISCREPANCY',
        entityType: 'StockDiscrepancy',
        entityId: id,
        oldValue: { status: target.status },
        newValue: { status: 'RESOLVED' },
        reason: body.resolveNote ?? null,
        ip,
        userAgent,
      })

      // اعلان به اعلام‌کننده — مغایرت شما برطرف شد
      if (target.createdById !== user.id) {
        const { notifyUsers } = await import('@/lib/notify')
        await notifyUsers({
          userIds: [target.createdById],
          type: 'STOCK_DISCREPANCY',
          title: 'مغایرت برطرف شد',
          body: `اعلام «${target.materialName}» توسط «${user.fullName}» برطرف شد.`,
          entityId: id,
          entityType: 'StockDiscrepancy',
        })
      }

      return ok({ id: resolved.id, status: resolved.status })
    },
    { permission: 'inventory.view', schema: discrepancyResolveSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'inventory-write' } }
  )(req, ctx)
}

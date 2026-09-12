import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { hasPermission } from '@/lib/permissions'
import { getUserScope, entryScopeFilter } from '@/lib/scope'
import { ApiError } from '@/lib/api'

/** Audit Log — برای کاربران عادی Read-Only و Scope-Aware */
export const GET = apiHandler(async ({ req, user }) => {
  if (!hasPermission(user.role, 'audit.view')) {
    throw new ApiError(403, 'FORBIDDEN', 'به گزارش حسابرسی دسترسی ندارید.')
  }
  const url = req.nextUrl
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get('pageSize') ?? '25') || 25))
  const action = url.searchParams.get('action') ?? ''

  const scope = await getUserScope(user)
  const globalUser = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'

  // Scope حسابرسی:
  // - ادمین‌ها: همه‌چیز
  // - مدیر کارگاه: لاگ‌های کارگاه خودش (روی Entityهای MaterialEntry)
  // - سرپرست: فقط لاگ‌های خودش
  let where: Record<string, unknown> = {}
  if (!globalUser) {
    if (user.role === 'WORKSHOP_MANAGER') {
      const entryIds = await db.materialEntry.findMany({ where: entryScopeFilter(scope), select: { id: true } }).then((es) => es.map((e) => e.id))
      where = {
        OR: [
          { userId: user.id },
          { entityType: 'MaterialEntry', entityId: { in: entryIds.length ? entryIds : ['__none__'] } },
        ],
      }
    } else {
      where = { userId: user.id }
    }
  }
  if (action && action !== 'ALL') where = { ...where, action }

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true, role: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return ok({
    logs,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  })
}, { rateLimit: { limit: 30, windowMs: 60_000, scope: 'audit-logs' } })

import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { ROLE_PERMISSIONS, type RoleKey } from '@/lib/permissions'

export const GET = apiHandler(async ({ user }) => {
  const scope = await getUserScope(user)
  const [workshops, projects, linkedWorker] = await Promise.all([
    db.workshop.findMany({
      where: scope.isGlobal ? { isActive: true } : { isActive: true, id: { in: scope.workshopIds.length ? scope.workshopIds : ['__none__'] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    db.project.findMany({
      where: {
        isActive: true,
        ...(scope.isGlobal
          ? {}
          : scope.projectIds
            ? { id: { in: scope.projectIds } }
            : { workshopId: { in: scope.workshopIds.length ? scope.workshopIds : ['__none__'] } }),
      },
      select: { id: true, name: true, code: true, workshopId: true },
      orderBy: { name: 'asc' },
    }),
    // نیروی اجرایی — پروفایل کارگر متصل (خوداظهاری: نام و کارگاه خودکار پر می‌شود)
    user.workerId
      ? db.worker.findUnique({ where: { id: user.workerId }, select: { id: true, fullName: true } })
      : Promise.resolve(null),
  ])

  return ok({
    user,
    permissions: ROLE_PERMISSIONS[user.role as RoleKey] ?? [],
    scope: { isGlobal: scope.isGlobal, workshopIds: scope.workshopIds, projectIds: scope.projectIds },
    workshops,
    projects,
    linkedWorker,
  })
})

import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '@/lib/permissions'

/** ماتریس نقش/دسترسی — منبع حقیقت: کد + seed به DB */
export const GET = apiHandler(
  async () => {
    const [dbRoles, dbPermissions] = await Promise.all([
      db.role.findMany({ include: { permissions: { include: { permission: true } } } }),
      db.permission.findMany(),
    ])
    return ok({
      codeMatrix: ROLE_PERMISSIONS,
      roles: ROLES,
      permissions: PERMISSIONS,
      db: {
        roles: dbRoles.map((r) => ({
          key: r.key,
          nameFa: r.nameFa,
          permissions: r.permissions.map((rp) => rp.permission.key),
        })),
        permissions: dbPermissions.map((p) => ({ key: p.key, nameFa: p.nameFa })),
      },
    })
  },
  { permission: 'admin.panel' }
)

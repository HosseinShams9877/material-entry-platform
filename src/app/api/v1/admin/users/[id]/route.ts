import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { updateUserSchema } from '@/lib/validate'
import { hashPassword } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import type { NextRequest } from 'next/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ body, user, params, ip, userAgent }) => {
      const { id } = params
      const input = body

      const target = await db.user.findUnique({ where: { id } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'کاربر یافت نشد.')

      // عملیات حساس: تغییر رمز / نقش / وضعیت → ابطال همهٔ نشست‌های فعال کاربر
      const passwordChanged = Boolean(input.password)
      const roleChanged = Boolean(input.role && input.role !== target.role)
      const deactivated = input.isActive === false && target.isActive

      const updated = await db.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id },
          data: {
            fullName: input.fullName ?? target.fullName,
            role: input.role ?? target.role,
            phone: input.phone ?? target.phone,
            workshopId: input.workshopId !== undefined ? input.workshopId : target.workshopId,
            isActive: input.isActive ?? target.isActive,
            ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
          },
        })
        if (input.workshopAccessIds) {
          await tx.userWorkshop.deleteMany({ where: { userId: id } })
          if (input.workshopAccessIds.length) {
            await tx.userWorkshop.createMany({ data: input.workshopAccessIds.map((workshopId) => ({ userId: id, workshopId })) })
          }
        }
        if (input.projectIds) {
          await tx.userProject.deleteMany({ where: { userId: id } })
          if (input.projectIds.length) {
            await tx.userProject.createMany({ data: input.projectIds.map((projectId) => ({ userId: id, projectId })) })
          }
        }
        if (passwordChanged || roleChanged || deactivated) {
          // همهٔ نشست‌ها باطل — توکن‌های قدیمی باید بی‌اعتبار شوند
          await tx.session.deleteMany({ where: { userId: id } })
        }
        return u
      })

      await writeAudit({
        user,
        action: roleChanged ? 'PERMISSION_CHANGE' : 'EDIT',
        entityType: 'User',
        entityId: id,
        oldValue: { role: target.role, isActive: target.isActive },
        newValue: {
          role: updated.role,
          isActive: updated.isActive,
          // هیچ مقدار حساسی (رمز/هش) ثبت نمی‌شود — فقط رخ‌داد تغییر
          passwordChanged,
          roleChanged,
          deactivated,
          sessionsRevoked: passwordChanged || roleChanged || deactivated,
        },
        ip,
        userAgent,
      })
      return ok({ id: updated.id })
    },
    { permission: 'users.manage', schema: updateUserSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'admin-user-write' } }
  )(req, ctx)
}

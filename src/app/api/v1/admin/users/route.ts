import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { createUserSchema } from '@/lib/validate'
import { hashPassword } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { ROLES } from '@/lib/permissions'

export const GET = apiHandler(
  async ({ req }) => {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    const users = await db.user.findMany({
      where: q ? { OR: [{ username: { contains: q } }, { fullName: { contains: q } }] } : {},
      include: {
        workshop: { select: { id: true, name: true } },
        userWorkshops: { include: { workshop: { select: { id: true, name: true } } } },
        userProjects: { include: { project: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return ok({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        roleFa: ROLES[u.role as keyof typeof ROLES] ?? u.role,
        phone: u.phone,
        isActive: u.isActive,
        workshop: u.workshop,
        workshops: u.userWorkshops.map((uw) => uw.workshop),
        projects: u.userProjects.map((up) => up.project),
        createdAt: u.createdAt,
      })),
    })
  },
  { permission: 'users.manage' }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const input = body
    const exists = await db.user.findUnique({ where: { username: input.username } })
    if (exists) throw new ApiError(409, 'USERNAME_TAKEN', 'این نام کاربری قبلاً ثبت شده است.')

    const created = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: input.username,
          passwordHash: await hashPassword(input.password),
          fullName: input.fullName,
          role: input.role,
          phone: input.phone ?? null,
          workshopId: input.workshopId ?? null,
        },
      })
      if (input.workshopAccessIds?.length) {
        await tx.userWorkshop.createMany({ data: input.workshopAccessIds.map((workshopId) => ({ userId: u.id, workshopId })) })
      }
      if (input.projectIds?.length) {
        await tx.userProject.createMany({ data: input.projectIds.map((projectId) => ({ userId: u.id, projectId })) })
      }
      return u
    })

    await writeAudit({
      user,
      action: 'CREATE',
      entityType: 'User',
      entityId: created.id,
      newValue: { username: created.username, role: created.role },
      ip,
      userAgent,
    })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'users.manage', schema: createUserSchema }
)

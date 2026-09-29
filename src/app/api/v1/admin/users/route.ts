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
        linkedWorker: { select: { id: true, fullName: true } },
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
        workerId: u.workerId,
        linkedWorker: u.linkedWorker,
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

    // نیروی اجرایی باید به پروفایل کارگر و کارگاه متصل باشد — پیش‌نیاز خوداظهاری
    let workerId: string | null = input.workerId ?? null
    if (input.role === 'FIELD_WORKER') {
      if (!workerId) throw new ApiError(422, 'WORKER_LINK_REQUIRED', 'برای نیروی اجرایی، اتصال به پروفایل کارگر الزامی است.')
      const worker = await db.worker.findUnique({ where: { id: workerId } })
      if (!worker) throw new ApiError(422, 'INVALID_WORKER', 'کارگر انتخاب‌شده معتبر نیست.')
      if (!input.workshopId) {
        throw new ApiError(422, 'WORKSHOP_REQUIRED', 'برای نیروی اجرایی، تعیین کارگاه اصلی الزامی است.')
      }
    } else if (!input.workerId) {
      workerId = null
    }

    const created = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: input.username,
          passwordHash: await hashPassword(input.password),
          fullName: input.fullName,
          role: input.role,
          phone: input.phone ?? null,
          workshopId: input.workshopId ?? null,
          workerId,
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
      newValue: { username: created.username, role: created.role, workerId },
      ip,
      userAgent,
    })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'users.manage', schema: createUserSchema }
)

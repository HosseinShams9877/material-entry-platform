import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/statements/[id]/submit — ارسال برای بررسی ───────────────────────────

export const POST = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const statement = await db.progressStatement.findUnique({
      where: { id: params.id },
      include: { workshop: { select: { name: true } } },
    })
    if (!statement) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')
    if (statement.createdById !== user.id) {
      throw new ApiError(403, 'FORBIDDEN', 'فقط ثبت‌کنندهٔ صورت وضعیت می‌تواند آن را ارسال کند.')
    }
    if (statement.status !== 'DRAFT') {
      throw new ApiError(423, 'STATEMENT_NOT_SUBMITTABLE', 'این صورت وضعیت قبلاً ارسال شده است.')
    }

    const now = new Date()
    await db.progressStatement.update({
      where: { id: statement.id },
      data: { status: 'SUBMITTED', submittedAt: now },
    })

    await writeAudit({
      user,
      action: 'SUBMIT_STATEMENT',
      entityType: 'ProgressStatement',
      entityId: statement.id,
      oldValue: { status: 'DRAFT' },
      newValue: { status: 'SUBMITTED' },
      ip,
      userAgent,
    })

    // اعلان به مدیران کارگاه + مدیران پروژه برای بررسی
    const workshopManagers = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: ['WORKSHOP_MANAGER', 'PROJECT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
        OR: [
          { workshopId: statement.workshopId },
          { userWorkshops: { some: { workshopId: statement.workshopId } } },
          { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        ],
      },
      select: { id: true },
    })
    const projectManagers = statement.projectId
      ? await db.user.findMany({
          where: { isActive: true, role: 'PROJECT_MANAGER', userProjects: { some: { projectId: statement.projectId } } },
          select: { id: true },
        })
      : []

    await notifyUsers({
      userIds: [...workshopManagers.map((m) => m.id), ...projectManagers.map((m) => m.id)],
      type: 'STATEMENT_SUBMITTED',
      title: 'صورت وضعیت جدید در انتظار بررسی',
      body: `«${user.fullName}» صورت وضعیت شمارهٔ ${statement.number.toLocaleString('fa-IR')} («${statement.title}») را ارسال کرد.`,
      entityId: statement.id,
      entityType: 'ProgressStatement',
    })

    return ok({ submitted: true })
  },
  { permission: 'statement.submit', rateLimit: { limit: 30, windowMs: 60_000, scope: 'statements-write' } }
)

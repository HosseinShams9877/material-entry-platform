import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { decideStatementSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

// ─────────────────────────── POST /api/v1/statements/[id]/approve — تأیید مدیر ───────────────────────────
// اگر مبلغ بالای آستانه باشد → «در انتظار امضای مدیر کل»؛ در غیر این صورت تأیید نهایی.

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const statement = await db.progressStatement.findUnique({ where: { id: params.id } })
    if (!statement) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')

    const scope = await getUserScope(user)
    const canAct =
      scope.isGlobal ||
      scope.workshopIds.includes(statement.workshopId) ||
      (statement.projectId && scope.projectIds !== null && scope.projectIds.includes(statement.projectId))
    if (!canAct) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')
    if (statement.status !== 'SUBMITTED') {
      throw new ApiError(423, 'STATEMENT_NOT_APPROVABLE', 'این صورت وضعیت در مرحلهٔ بررسی نیست.')
    }

    const now = new Date()
    const nextStatus = statement.needsGmSign ? 'PENDING_GM_SIGN' : 'APPROVED'

    await db.progressStatement.update({
      where: { id: statement.id },
      data: {
        status: nextStatus,
        approvedById: user.id,
        approvedAt: now,
        approvalNote: body.note ?? null,
      },
    })

    await writeAudit({
      user,
      action: 'APPROVE_STATEMENT',
      entityType: 'ProgressStatement',
      entityId: statement.id,
      oldValue: { status: statement.status },
      newValue: { status: nextStatus, note: body.note ?? null },
      ip,
      userAgent,
    })

    if (nextStatus === 'PENDING_GM_SIGN') {
      // اعلان به مدیر کل برای امضا
      const gms = await db.user.findMany({
        where: { isActive: true, role: 'GENERAL_MANAGER' },
        select: { id: true },
      })
      await notifyUsers({
        userIds: gms.map((g) => g.id),
        type: 'STATEMENT_PENDING_GM_SIGN',
        title: 'صورت وضعیت نیازمند امضای شماست',
        body: `صورت وضعیت شمارهٔ ${statement.number.toLocaleString('fa-IR')} («${statement.title}») به دلیل مبلغ بالای آستانه، نیازمند امضای مدیر کل است.`,
        entityId: statement.id,
        entityType: 'ProgressStatement',
      })
    }

    // اعلان به ثبت‌کننده
    await notifyUsers({
      userIds: [statement.createdById],
      type: 'STATEMENT_DECIDED',
      title: nextStatus === 'APPROVED' ? 'صورت وضعیت تأیید شد' : 'صورت وضعیت به مدیر کل ارجاع شد',
      body:
        nextStatus === 'APPROVED'
          ? `صورت وضعیت شمارهٔ ${statement.number.toLocaleString('fa-IR')} توسط «${user.fullName}» تأیید شد.`
          : `صورت وضعیت شمارهٔ ${statement.number.toLocaleString('fa-IR')} توسط «${user.fullName}» تأیید و برای امضای مدیر کل ارسال شد.`,
      entityId: statement.id,
      entityType: 'ProgressStatement',
    })

    return ok({ status: nextStatus })
  },
  {
    permission: 'statement.approve',
    schema: decideStatementSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'statements-write' },
  }
)

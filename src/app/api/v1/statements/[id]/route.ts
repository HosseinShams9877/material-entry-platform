import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope, canAccessWorkshopRecord } from '@/lib/scope'
import { updateStatementSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'
import { hasPermission, GM_SIGN_THRESHOLD_TOMAN } from '@/lib/permissions'
import { makeSignedStatementSignatureUrl } from '@/lib/signed-url'

// ─────────────────────────── GET /api/v1/statements/[id] — جزئیات صورت وضعیت ───────────────────────────

export const GET = apiHandler(
  async ({ params, user }) => {
    const statement = await db.progressStatement.findUnique({
      where: { id: params.id },
      include: {
        workshop: { select: { name: true } },
        project: { select: { name: true } },
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        signedBy: { select: { fullName: true } },
        rejectedBy: { select: { fullName: true } },
      },
    })
    if (!statement) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')

    const scope = await getUserScope(user)
    if (!canAccessWorkshopRecord(scope, statement, user.id)) {
      throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')
    }

    const isCreator = statement.createdById === user.id
    const canApprove =
      hasPermission(user.role, 'statement.approve') && statement.status === 'SUBMITTED'
    const canSign = user.role === 'GENERAL_MANAGER' && statement.status === 'PENDING_GM_SIGN'

    return ok({
      statement: {
        id: statement.id,
        number: statement.number,
        title: statement.title,
        status: statement.status,
        amount: statement.amount.toString(),
        amountFormatted: statement.amount.toLocaleString('fa-IR'),
        needsGmSign: statement.needsGmSign,
        workshopId: statement.workshopId,
        workshopName: statement.workshop.name,
        projectId: statement.projectId,
        projectName: statement.project?.name ?? null,
        periodText: statement.periodText,
        description: statement.description,
        createdById: statement.createdById,
        createdByName: statement.createdBy.fullName,
        submittedAt: statement.submittedAt?.toISOString() ?? null,
        approvedByName: statement.approvedBy?.fullName ?? null,
        approvedAt: statement.approvedAt?.toISOString() ?? null,
        approvalNote: statement.approvalNote,
        signedByName: statement.signedBy?.fullName ?? null,
        signerName: statement.signerName,
        signedAt: statement.signedAt?.toISOString() ?? null,
        signatureUrl:
          statement.signaturePath && statement.status === 'SIGNED'
            ? makeSignedStatementSignatureUrl(statement.id)
            : null,
        rejectedByName: statement.rejectedBy?.fullName ?? null,
        rejectedAt: statement.rejectedAt?.toISOString() ?? null,
        rejectReason: statement.rejectReason,
        createdAt: statement.createdAt.toISOString(),
        canEdit:
          isCreator &&
          statement.status === 'DRAFT' &&
          hasPermission(user.role, 'statement.create'),
        canSubmit:
          (isCreator || hasPermission(user.role, 'statement.approve')) &&
          statement.status === 'DRAFT' &&
          hasPermission(user.role, 'statement.submit'),
        canApprove,
        canSign,
        canDelete:
          isCreator &&
          statement.status === 'DRAFT' &&
          hasPermission(user.role, 'statement.create'),
      },
      gmThreshold: GM_SIGN_THRESHOLD_TOMAN,
    })
  },
  { permission: 'statement.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'statements' } }
)

// ─────────────────────────── PATCH /api/v1/statements/[id] — ویرایش پیش‌نویس ───────────────────────────

export const PATCH = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const existing = await db.progressStatement.findUnique({ where: { id: params.id } })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')

    const isCreator = existing.createdById === user.id
    if (!isCreator || !hasPermission(user.role, 'statement.create')) {
      throw new ApiError(403, 'FORBIDDEN', 'فقط ثبت‌کنندهٔ صورت وضعیت می‌تواند آن را ویرایش کند.')
    }
    if (existing.status !== 'DRAFT') {
      throw new ApiError(423, 'STATEMENT_NOT_EDITABLE', 'فقط پیش‌نویس قابل ویرایش است.')
    }

    const amountBigInt =
      body.amount !== undefined ? BigInt(Math.round(body.amount)) : undefined

    const updated = await db.progressStatement.update({
      where: { id: existing.id },
      data: {
        title: body.title !== undefined ? body.title : undefined,
        projectId: body.projectId !== undefined ? body.projectId : undefined,
        periodText: body.periodText !== undefined ? body.periodText : undefined,
        amount: amountBigInt,
        needsGmSign:
          amountBigInt !== undefined
            ? amountBigInt > BigInt(GM_SIGN_THRESHOLD_TOMAN)
            : undefined,
        description: body.description !== undefined ? body.description : undefined,
      },
    })

    await writeAudit({
      user,
      action: 'EDIT_STATEMENT',
      entityType: 'ProgressStatement',
      entityId: existing.id,
      oldValue: { amount: existing.amount.toString(), title: existing.title },
      newValue: { amount: updated.amount.toString(), title: updated.title },
      ip,
      userAgent,
    })

    return ok({ updated: true })
  },
  {
    permission: 'statement.create',
    schema: updateStatementSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'statements-write' },
  }
)

// ─────────────────────────── DELETE /api/v1/statements/[id] — حذف پیش‌نویس ───────────────────────────

export const DELETE = apiHandler(
  async ({ params, user, ip, userAgent }) => {
    const existing = await db.progressStatement.findUnique({ where: { id: params.id } })
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')

    const isCreator = existing.createdById === user.id
    if (!isCreator || !hasPermission(user.role, 'statement.create')) {
      throw new ApiError(403, 'FORBIDDEN', 'فقط ثبت‌کنندهٔ صورت وضعیت می‌تواند آن را حذف کند.')
    }
    if (existing.status !== 'DRAFT') {
      throw new ApiError(423, 'STATEMENT_NOT_DELETABLE', 'فقط پیش‌نویس قابل حذف است.')
    }

    await db.progressStatement.delete({ where: { id: existing.id } })

    await writeAudit({
      user,
      action: 'DELETE_STATEMENT',
      entityType: 'ProgressStatement',
      entityId: existing.id,
      oldValue: { number: existing.number, title: existing.title },
      ip,
      userAgent,
    })

    return ok({ deleted: true })
  },
  { permission: 'statement.create', rateLimit: { limit: 30, windowMs: 60_000, scope: 'statements-write' } }
)

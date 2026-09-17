import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { checklistItemPatchSchema } from '@/lib/validate'
import type { NextRequest } from 'next/server'

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>
}

// ─────────────────────────── PATCH /api/v1/admin/projects/[id]/checklist/[itemId] — تیک/ویرایش آیتم ───────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ user, params, body, ip, userAgent }) => {
      const item = await db.projectChecklistItem.findUnique({ where: { id: params.itemId } })
      if (!item || item.projectId !== params.id) {
        throw new ApiError(404, 'NOT_FOUND', 'آیتم چک‌لیست یافت نشد.')
      }

      const updated = await db.projectChecklistItem.update({
        where: { id: item.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.isDone !== undefined
            ? { isDone: body.isDone, doneAt: body.isDone ? new Date() : null, doneById: body.isDone ? user.id : null }
            : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
      })

      await writeAudit({
        user,
        action: 'CHECKLIST_UPDATE',
        entityType: 'ProjectChecklistItem',
        entityId: item.id,
        oldValue: { isDone: item.isDone },
        newValue: { isDone: updated.isDone, title: updated.title },
        ip,
        userAgent,
      })

      return ok({
        id: updated.id,
        title: updated.title,
        sortOrder: updated.sortOrder,
        isDone: updated.isDone,
        doneAt: updated.doneAt?.toISOString() ?? null,
        note: updated.note,
      })
    },
    { permission: 'checklist.update', schema: checklistItemPatchSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'checklist-write' } }
  )(req, ctx)
}

// ─────────────────────────── DELETE /api/v1/admin/projects/[id]/checklist/[itemId] ───────────────────────────

export async function DELETE(req: NextRequest, ctx: RouteParams) {
  return apiHandler(
    async ({ user, params, ip, userAgent }) => {
      const item = await db.projectChecklistItem.findUnique({ where: { id: params.itemId } })
      if (!item || item.projectId !== params.id) {
        throw new ApiError(404, 'NOT_FOUND', 'آیتم چک‌لیست یافت نشد.')
      }

      await db.projectChecklistItem.delete({ where: { id: item.id } })

      await writeAudit({
        user,
        action: 'CHECKLIST_UPDATE',
        entityType: 'ProjectChecklistItem',
        entityId: item.id,
        oldValue: { title: item.title, deleted: true },
        ip,
        userAgent,
      })

      return ok({ deleted: true })
    },
    { permission: 'checklist.update', rateLimit: { limit: 30, windowMs: 60_000, scope: 'checklist-write' } }
  )(req, ctx)
}

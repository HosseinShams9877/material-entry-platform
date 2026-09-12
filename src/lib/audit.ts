import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'
import { logger, safeErrorMeta } from '@/lib/logger'

export type AuditAction =
  | 'CREATE' | 'EDIT' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTION'
  | 'APPROVE_CORRECTION' | 'REJECT_CORRECTION' | 'LOCK' | 'UPLOAD_ATTACHMENT'
  | 'DELETE_ATTACHMENT' | 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'PERMISSION_CHANGE'
  | 'VOICE_PROCESS' | 'RESUBMIT'
  // زنجیرهٔ حرفه‌ای Workflow
  | 'TECH_REVIEW_START' | 'TECH_REVIEW_COMPLETE' | 'WAREHOUSE_CONFIRM' | 'DELIVER' | 'CLOSE' | 'ROLLBACK'
  // ماژول وظایف و گزارش روزانه
  | 'CREATE_DAILY_TASK' | 'UPDATE_DAILY_TASK' | 'DELETE_DAILY_TASK' | 'SEND_DAILY_TASK'
  | 'COMPLETE_TASK_ITEM' | 'UNCOMPLETE_TASK_ITEM' | 'COMPLETE_DAILY_TASK'
  | 'CANCEL_DAILY_TASK' | 'CREATE_DAILY_REPORT' | 'UPDATE_DAILY_REPORT'
  | 'SUBMIT_DAILY_REPORT' | 'REVIEW_DAILY_REPORT'
  | 'UPLOAD_TASK_AUDIO' | 'UPLOAD_REPORT_AUDIO' | 'UPLOAD_COMMENT_AUDIO'
  | 'UPLOAD_ITEM_PHOTO' | 'DELETE_ITEM_PHOTO'
  | 'TRANSCRIBE_AUDIO' | 'TRANSCRIPTION_FAILED'

interface AuditInput {
  user?: SessionUser | null
  action: AuditAction
  entityType: string
  entityId?: string | null
  oldValue?: unknown
  newValue?: unknown
  ip?: string | null
  userAgent?: string | null
  reason?: string | null
}

/**
 * ثبت Audit Log — هرگز نباید عملیات اصلی را شکست دهد؛ خطا فقط log می‌شود.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.user?.id ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        oldValue: input.oldValue !== undefined ? JSON.stringify(input.oldValue) : null,
        newValue: input.newValue !== undefined ? JSON.stringify(input.newValue) : null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        reason: input.reason ?? null,
      },
    })
  } catch (err) {
    // Audit ناموفق فقط لاگ می‌شود — ساختاریافته و بدون جزئیات حساس
    logger.error('audit', 'failed to write audit log', safeErrorMeta(err))
  }
}

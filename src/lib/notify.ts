import { db } from '@/lib/db'
import { logger, safeErrorMeta } from '@/lib/logger'
import { dispatchForNotificationRow } from '@/lib/notify-channels'

// ─────────────────────────── ایجاد اعلان (ضدخطا) ───────────────────────────
// اعلان هرگز نباید عملیات اصلی (ایجاد وظیفه/گزارش/…) را شکست دهد؛
// خطا فقط ساختاریافته لاگ می‌شود.

export type DailyNotificationType =
  | 'TASK_SENT'
  | 'TASK_UPDATED'
  | 'TASK_ITEM_COMPLETED'
  | 'TASK_COMPLETED'
  | 'TASK_CANCELLED'
  | 'REPORT_SUBMITTED'
  | 'REPORT_REVIEWED'
  | 'TASK_DUE_SOON'
  | 'TASK_OVERDUE'
  // صورت وضعیت
  | 'STATEMENT_SUBMITTED'
  | 'STATEMENT_PENDING_GM_SIGN'
  | 'STATEMENT_SIGNED'
  | 'STATEMENT_DECIDED'
  // اعلام نیاز و خرید
  | 'PURCHASE_REQUESTED'
  | 'PURCHASE_DECIDED'
  | 'PURCHASE_ORDERED'
  | 'PURCHASE_RECEIVED'
  // هشدار درخواست بی‌پاسخ
  | 'PURCHASE_STALE'
  // مالی ساده — پرداخت و سررسید (سند سیستم یکپارچه)
  | 'PAYMENT_REGISTERED'
  | 'RECEIVABLE_CREATED'

interface NotifyInput {
  userIds: string[]
  type: DailyNotificationType
  title: string
  body: string
  entityId?: string | null
  entityType?: string | null
}

/** ایجاد اعلان برای چند کاربر — یکتاسازی شناسه‌ها؛ هرگز throw نمی‌کند */
export async function notifyUsers(input: NotifyInput): Promise<void> {
  const ids = Array.from(new Set(input.userIds.filter(Boolean)))
  if (ids.length === 0) return
  try {
    const rows = await db.$transaction(
      ids.map((userId) =>
        db.notification.create({
          data: {
            userId,
            type: input.type,
            title: input.title,
            body: input.body,
            entityId: input.entityId ?? null,
            entityType: input.entityType ?? null,
          },
        })
      )
    )
    // تحویل خارجی (SMS/Email/Push) — غیرهمزمان و ضدخطا؛ جریان اصلی منتظر نمی‌ماند
    void Promise.allSettled(rows.map((r) => dispatchForNotificationRow(r)))
  } catch (err) {
    logger.error('notify', 'failed to create notifications', safeErrorMeta(err))
  }
}

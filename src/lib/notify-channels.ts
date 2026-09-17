import { db } from '@/lib/db'
import { logger, safeErrorMeta } from '@/lib/logger'
import {
  NOTIFY_SMS_WEBHOOK_URL,
  NOTIFY_EMAIL_WEBHOOK_URL,
  NOTIFY_PUSH_WEBHOOK_URL,
  NOTIFY_WEBHOOK_TIMEOUT_MS,
  NOTIFY_DELIVERY_DETAIL_MAX,
} from '@/lib/env'

// ─────────────────────────── دیسپچر کانال‌های اعلان (Enterprise) ───────────────────────────
// اعلان درون‌برنامه‌ای همیشه ارسال می‌شود (جدول Notification).
// کانال‌های خارجی (SMS/Email/Push) اختیاری‌اند: اگر Webhook URL تنظیم نشده باشد
// رکورد SKIPPED ثبت می‌شود؛ خطای سرویس خارجی هرگز جریان اصلی را نمی‌شکند.

export type ExternalChannel = 'SMS' | 'EMAIL' | 'PUSH'

interface DispatchPayload {
  userId: string
  type: string
  title: string
  body: string
  entityId?: string | null
  entityType?: string | null
}

async function callWebhook(url: string, payload: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NOTIFY_WEBHOOK_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = (await res.text().catch(() => '')) || ''
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status} ${text.slice(0, NOTIFY_DELIVERY_DETAIL_MAX)}`.trim() }
    }
    return { ok: true, detail: `HTTP ${res.status}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return { ok: false, detail: msg.slice(0, NOTIFY_DELIVERY_DETAIL_MAX) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * تحویل یک اعلان به یک کاربر در کانال‌های خارجی — ضدخطا.
 * SMS ← user.phone، Email ← user.email، Push ← Webhook عمومی.
 * همیشه رکورد NotificationDelivery ثبت می‌کند.
 */
export async function dispatchExternalChannels(notificationId: string, payload: DispatchPayload): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { phone: true, email: true },
    })

    const tasks: Array<{ channel: ExternalChannel; run: () => Promise<{ ok: boolean; detail: string }> }> = []

    // SMS
    if (NOTIFY_SMS_WEBHOOK_URL) {
      tasks.push({
        channel: 'SMS',
        run: async () => {
          if (!user?.phone) return { ok: false, detail: 'SKIPPED: user has no phone' }
          return callWebhook(NOTIFY_SMS_WEBHOOK_URL, {
            phone: user.phone,
            message: `${payload.title}\n${payload.body}`,
            userId: payload.userId,
            entityId: payload.entityId ?? null,
            entityType: payload.entityType ?? null,
          })
        },
      })
    }

    // Email
    if (NOTIFY_EMAIL_WEBHOOK_URL) {
      tasks.push({
        channel: 'EMAIL',
        run: async () => {
          if (!user?.email) return { ok: false, detail: 'SKIPPED: user has no email' }
          return callWebhook(NOTIFY_EMAIL_WEBHOOK_URL, {
            email: user.email,
            subject: payload.title,
            body: payload.body,
            userId: payload.userId,
            entityId: payload.entityId ?? null,
            entityType: payload.entityType ?? null,
          })
        },
      })
    }

    // Push
    if (NOTIFY_PUSH_WEBHOOK_URL) {
      tasks.push({
        channel: 'PUSH',
        run: () =>
          callWebhook(NOTIFY_PUSH_WEBHOOK_URL, {
            userId: payload.userId,
            title: payload.title,
            body: payload.body,
            type: payload.type,
            entityId: payload.entityId ?? null,
            entityType: payload.entityType ?? null,
          }),
      })
    }

    if (tasks.length === 0) return // هیچ کانال خارجی پیکربندی نشده — رکوردی هم لازم نیست

    const results = await Promise.all(
      tasks.map(async (t) => {
        let outcome: { ok: boolean; detail: string }
        try {
          outcome = await t.run()
        } catch (err) {
          outcome = { ok: false, detail: (err instanceof Error ? err.message : 'error').slice(0, NOTIFY_DELIVERY_DETAIL_MAX) }
        }
        return { channel: t.channel, ...outcome }
      })
    )

    await db.notificationDelivery.createMany({
      data: results.map((r) => ({
        notificationId,
        channel: r.channel,
        status: r.ok ? 'SENT' : r.detail.startsWith('SKIPPED') ? 'SKIPPED' : 'FAILED',
        detail: r.detail || null,
      })),
    })
  } catch (err) {
    logger.error('notify', 'external channel dispatch failed', safeErrorMeta(err))
  }
}

/** پس از ایجاد اعلان‌های In-App، این تابع برای تحویل خارجی فراخوانی شود (idempotent-safe) */
export async function dispatchForNotificationRow(row: {
  id: string
  userId: string
  type: string
  title: string
  body: string
  entityId: string | null
  entityType: string | null
}): Promise<void> {
  await dispatchExternalChannels(row.id, row)
}

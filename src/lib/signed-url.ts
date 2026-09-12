import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSignedUrlSecret, SIGNED_URL_TTL_MS } from '@/lib/env'

// ─────────────────────────── Signed URL پیوست‌ها ───────────────────────────
// قالب توکن: «expiresAtMs.hex64» — HMAC-SHA256(attachmentId.expiresAtMs, SECRET)
// مقاوم در برابر: توکن جعلی (امضای نامعتبر)، توکن منقضی، طول/قالب نامعتبر (Hex کوتاه/غیر hex)
// Secret هرگز مقدار پیش‌فرض ندارد — در Production نبود آن خطای واضح می‌دهد (lib/env).

const HEX_64 = /^[0-9a-f]{64}$/

/** امضای HMAC برای Signed URL پیوست‌ها */
export function signAttachmentId(attachmentId: string, expiresAtMs: number): string {
  const payload = `${attachmentId}.${expiresAtMs}`
  const sig = createHmac('sha256', getSignedUrlSecret()).update(payload).digest('hex')
  return `${expiresAtMs}.${sig}`
}

/**
 * اعتبارسنجی توکن — تمام ورودی‌ها با قالب سخت‌گیرانه بررسی می‌شوند؛
 * هر ورودی خراب «false» می‌گیرد، هرگز Exception سطح مسیر نمی‌دهد.
 */
export function verifyAttachmentSignature(attachmentId: string, token: string): boolean {
  if (typeof token !== 'string' || token.length > 200) return false
  const dot = token.indexOf('.')
  if (dot === -1) return false
  const expStr = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  // قالب امضا: دقیقاً ۶۴ نویسهٔ hex کوچک
  if (!HEX_64.test(sig)) return false

  // انقضا: عدد صحیح مثبت
  if (!/^\d{1,15}$/.test(expStr)) return false
  const exp = Number(expStr)
  if (!Number.isSafeInteger(exp) || exp < Date.now()) return false

  const expected = createHmac('sha256', getSignedUrlSecret())
    .update(`${attachmentId}.${exp}`)
    .digest('hex')

  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false // عملاً با HEX_64 تضمین شده؛ دفاع لایهٔ دوم
  return timingSafeEqual(a, b)
}

/** ساخت URL امضاشده با TTL قابل تنظیم از Environment (SIGNED_URL_TTL_MS) */
export function makeSignedFileUrl(attachmentId: string, ttlMs: number = SIGNED_URL_TTL_MS): string {
  return `/api/v1/attachments/${attachmentId}/file?token=${signAttachmentId(attachmentId, Date.now() + ttlMs)}`
}

// ─────────────────────────── Signed URL فایل‌های صوتی ماژول روزانه ───────────────────────────
// همان قالب و Secret امضا (HMAC-SHA256(id.expiresAtMs)) — مسیر پخش متمایز: /api/v1/daily-audio/[id]/file
// Secret پیش‌فرض وجود ندارد (lib/env)؛ TTL از Environment کنترل می‌شود.

export function signDailyAudioId(audioId: string, expiresAtMs: number): string {
  return signAttachmentId(audioId, expiresAtMs)
}

export function verifyDailyAudioSignature(audioId: string, token: string): boolean {
  return verifyAttachmentSignature(audioId, token)
}

export function makeSignedDailyAudioUrl(audioId: string, ttlMs: number = SIGNED_URL_TTL_MS): string {
  return `/api/v1/daily-audio/${audioId}/file?token=${signDailyAudioId(audioId, Date.now() + ttlMs)}`
}

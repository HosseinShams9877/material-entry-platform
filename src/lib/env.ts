import path from 'node:path'

// ─────────────────────────── پیکربندی متمرکز Environment ───────────────────────────
// تک نقطهٔ خواندن متغیرهای محیطی با اعتبارسنجی سخت‌گیرانه.
// در Production نبود متغیرهای ضروری → خطای واضح (fail-fast) هنگام اولین استفاده.
// توجه: هنگام `next build` (phase-production-build) اعتبارسنجی انجام نمی‌شود
// تا Build به متغیرهای Runtime وابسته نباشد.

export const IS_PROD = process.env.NODE_ENV === 'production'
export const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build'

function parsePositiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`متغیر محیطی ${name} باید یک عدد صحیح مثبت باشد (مقدار فعلی: "${value}").`)
  }
  return n
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

let cachedSecret: string | null = null

/** Secret امضای Signed URL — در Production الزامی؛ هیچ مقدار پیش‌فرضی وجود ندارد. */
export function getSignedUrlSecret(): string {
  if (cachedSecret) return cachedSecret
  const secret = process.env.SIGNED_URL_SECRET?.trim()
  if (!secret) {
    if (IS_PROD && !IS_BUILD_PHASE) {
      throw new Error(
        'SIGNED_URL_SECRET در Environment تنظیم نشده است. ' +
          'امنیت Signed URL وابسته به این Secret است؛ سرور عمداً متوقف می‌شود. ' +
          'یک مقدار تصادفی حداقل ۳۲ کاراکتری تولید کنید: `openssl rand -hex 32`'
      )
    }
    // فقط در Development: Secret اپhemeral برای هر راه‌اندازی (نشت بین محیط‌ها ندارد)
    return 'dev-only-ephemeral-signed-url-secret'
  }
  if (IS_PROD && secret.length < 32) {
    throw new Error('SIGNED_URL_SECRET در Production باید حداقل ۳۲ کاراکتر باشد.')
  }
  cachedSecret = secret
  return secret
}

/** پوشهٔ ذخیرهٔ فایل‌های خصوصی — خارج از public؛ قابل تنظیم برای Docker */
export const UPLOAD_DIR: string = path.resolve(
  process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), 'uploads')
)

/** مدت اعتبار Signed URL (میلی‌ثانیه) — پیش‌فرض ۱۰ دقیقه */
export const SIGNED_URL_TTL_MS: number = parsePositiveInt(
  process.env.SIGNED_URL_TTL_MS,
  10 * 60 * 1000,
  'SIGNED_URL_TTL_MS'
)

/** عمر نشست کاربر (روز) — پیش‌فرض ۳۰ روز */
export const SESSION_TTL_DAYS: number = parsePositiveInt(
  process.env.SESSION_TTL_DAYS,
  30,
  'SESSION_TTL_DAYS'
)

/**
 * آیا هدرهای Proxy (x-forwarded-for / x-real-ip) قابل اعتمادند؟
 * فقط وقتی سرور پشت Reverse Proxy معتمد (Caddy/Nginx/…) است true تنظیم شود.
 * پیش‌فرض: Development=true، Production=false (مقاوم در برابر جعل IP).
 */
export const TRUST_PROXY: boolean = parseBool(process.env.TRUST_PROXY, !IS_PROD)

/** کوکی Secure — در Production پیش‌فرض true (نیازمند HTTPS) */
export const COOKIE_SECURE: boolean = parseBool(process.env.COOKIE_SECURE, IS_PROD)

// ─────────────────────────── سخت‌سازی Session (Enterprise) ───────────────────────────

/**
 * اتصال نشست به User-Agent — ضد Session Hijacking.
 * اگر UA نشستِ ثبت‌شده با درخواست فعلی فرق کند، نشست باطل می‌شود.
 * (تغییر مرورگر/دستگاه = ورود جدید؛ به‌سرقت‌رفتن کوکی به‌تنهایی کافی نیست)
 * پیش‌فرض: فعال — با SESSION_BIND_UA=0 قابل خاموش‌کردن برای شبکه‌های با Proxy بازنویسی‌کنندهٔ UA
 */
export const SESSION_BIND_UA: boolean = parseBool(process.env.SESSION_BIND_UA, true)

/**
 * تمدید لغزان نشست (Sliding Renewal / Refresh Token Effect):
 * اگر بیش از نیمی از عمر نشست گذشته باشد، با هر فعالیت معتبر تمدید می‌شود —
 * کاربر فعال هرگز وسط کار Logout نمی‌شود؛ نشست بلااستفاده به‌موقع می‌میرد.
 */
export const SESSION_SLIDING: boolean = parseBool(process.env.SESSION_SLIDING, true)

// ─────────────────────────── کانال‌های اعلان خارجی (Enterprise) ───────────────────────────
// هر کانال اختیاری است: Webhook URL از Environment می‌آید (سازگار با درگاه‌های پیامک/ایمیل/پوش
// مانند کاوه‌نگار، SMS.ir، OneSignal، FCM Relay، …).
// سرور POST JSON می‌زند: { phone|email|userId, title, body, entityId, entityType }.
// هر تلاش تحویل در NotificationDelivery ثبت می‌شود (SENT/FAILED/SKIPPED).

export const NOTIFY_SMS_WEBHOOK_URL: string = process.env.NOTIFY_SMS_WEBHOOK_URL?.trim() || ''
export const NOTIFY_EMAIL_WEBHOOK_URL: string = process.env.NOTIFY_EMAIL_WEBHOOK_URL?.trim() || ''
export const NOTIFY_PUSH_WEBHOOK_URL: string = process.env.NOTIFY_PUSH_WEBHOOK_URL?.trim() || ''

/** مهلت زمانی فراخوانی هر Webhook اعلان (میلی‌ثانیه) */
export const NOTIFY_WEBHOOK_TIMEOUT_MS: number = parsePositiveInt(process.env.NOTIFY_WEBHOOK_TIMEOUT_MS, 8000, 'NOTIFY_WEBHOOK_TIMEOUT_MS')

/** حداکثر طول بدنهٔ ذخیره‌شدهٔ خطای تحویل */
export const NOTIFY_DELIVERY_DETAIL_MAX: number = 400

// ─────────────────────────── ماژول وظایف روزانه — صوت و تبدیل گفتار ───────────────────────────

/** سقف حجم فایل صوتی (مگابایت) — پیش‌فرض ۱۵ */
export const AUDIO_MAX_MB: number = parsePositiveInt(process.env.AUDIO_MAX_MB, 15, 'AUDIO_MAX_MB')

/** ارائه‌دهندهٔ تبدیل گفتار به متن: z-ai (پیش‌فرض) | external | none */
export type SttProvider = 'z-ai' | 'external' | 'none'

export function getSttProvider(): SttProvider {
  const raw = (process.env.STT_PROVIDER ?? 'z-ai').trim().toLowerCase()
  if (raw === 'z-ai' || raw === 'external' || raw === 'none') return raw
  throw new Error(
    `مقدار STT_PROVIDER نامعتبر است: "${raw}". مقادیر مجاز: z-ai | external | none`
  )
}

/** زبان پیش‌فرض تبدیل گفتار به متن */
export const STT_LANGUAGE: string = process.env.STT_LANGUAGE?.trim() || 'fa'

/** آدرس سرویس خارجی STT — فقط برای STT_PROVIDER=external */
export const STT_API_URL: string = process.env.STT_API_URL?.trim() || ''

/** کلید API سرویس خارجی STT — فقط از Environment؛ هرگز در کد/کلاینت قرار نمی‌گیرد */
export const STT_API_KEY: string = process.env.STT_API_KEY?.trim() || ''

/**
 * اعتبارسنجی کامل متغیرهای ضروری Production — در startup استقرار فراخوانی کنید
 * (یا اجازه دهید اولین استفاده از getSignedUrlSecret با خطای واضح متوقف شود).
 */
export function validateProductionEnv(): void {
  if (!IS_PROD) return
  getSignedUrlSecret() // در نبود Secret می‌ترکد
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL در Environment تنظیم نشده است.')
  }
}

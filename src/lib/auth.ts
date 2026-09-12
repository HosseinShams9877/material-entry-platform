import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { COOKIE_SECURE, IS_PROD, SESSION_BIND_UA, SESSION_SLIDING, SESSION_TTL_DAYS } from '@/lib/env'
import { logger } from '@/lib/logger'

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>

// ─────────────────────────── Password ───────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `scrypt:${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, salt, hash] = stored.split(':')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const derived = await scrypt(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    if (expected.length !== derived.length) return false
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

// ─────────────────────────── Session ───────────────────────────

/**
 * نام کوکی:
 * - Production: «__Host-smi_session» — پیشوند __Host- مرورگرها را ملزم می‌کند:
 *   Secure، Path=/، بدون Domain (سازگار با معماری؛ ساب‌دامین جدا نداریم).
 * - Development: «smi_session» (HTTP محلی بدون Secure)
 */
export const SESSION_COOKIE = IS_PROD ? '__Host-smi_session' : 'smi_session'

const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface SessionUser {
  id: string
  username: string
  fullName: string
  role: string
  workshopId: string | null
  phone: string | null
}

/**
 * ایجاد جلسه جدید — توکن خام فقط در کوکی می‌رود، هش آن در DB ذخیره می‌شود.
 * فرصتِ پاک‌سازی نشست‌های منقضی هم در همین مسیر کم‌هزینه بررسی می‌شود.
 */
export async function createSession(
  userId: string,
  ip?: string | null,
  userAgent?: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
    },
  })
  void scheduleExpiredSessionCleanup()
  return { token, expiresAt }
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    expires: expiresAt,
    path: '/',
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, expires: new Date(0), path: '/' })
}

/**
 * خواندن کاربر فعلی از کوکی جلسه — مبنای تمام کنترل‌های دسترسی.
 * userAgent (اختیاری): برای اتصال نشست به دستگاه — apiHandler همیشه پاس می‌دهد.
 * نشست منقضی/ناسازگار → حذف از DB + null. کاربر غیرفعال → null (و حذف نشست).
 * تمدید لغزان: کوکی با انقضای جدید بازنویسی می‌شود.
 */
export async function getSessionUser(userAgent?: string | null): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const res = await getUserByToken(token, { userAgent })
  if (res?.renewedExpiresAt) {
    // تمدید لغزان — کوکی هم با انقضای جدید بازنویسی می‌شود
    try {
      store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: COOKIE_SECURE,
        expires: res.renewedExpiresAt,
        path: '/',
      })
    } catch {
      // بازنویسی کوکی در برخی مسیرها (مثلاً GET فایل) ممکن نیست — نشست همچنان معتبر است
    }
  }
  return res?.user ?? null
}

export interface GetTokenResult {
  user: SessionUser
  renewedExpiresAt?: Date
}

export async function getUserByToken(
  token: string,
  opts?: { userAgent?: string | null }
): Promise<GetTokenResult | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now() || !session.user.isActive) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  // ضد Session Hijacking — اتصال نشست به User-Agent ثبت‌شده
  if (SESSION_BIND_UA && session.userAgent && opts?.userAgent && session.userAgent !== opts.userAgent) {
    logger.warn('auth', 'session UA mismatch — revoking', { sessionId: session.id })
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  // تمدید لغزان — اگر بیش از نیمی از عمر نشست گذشته، تمدیدش کن (Refresh Token Effect)
  let renewedExpiresAt: Date | undefined
  if (SESSION_SLIDING) {
    const ttlMs = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    const remaining = session.expiresAt.getTime() - Date.now()
    if (remaining < ttlMs / 2) {
      renewedExpiresAt = new Date(Date.now() + ttlMs)
      await db.session
        .update({ where: { id: session.id }, data: { expiresAt: renewedExpiresAt } })
        .catch(() => undefined)
    }
  }
  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
      role: session.user.role,
      workshopId: session.user.workshopId,
      phone: session.user.phone,
    },
    renewedExpiresAt,
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  await clearSessionCookie()
}

/** خروج از «همهٔ نشست‌های» کاربر (مثلاً پس از مشکوک‌شدن به لو رفتن توکن) */
export async function destroyAllUserSessions(userId: string): Promise<number> {
  const res = await db.session.deleteMany({ where: { userId } })
  return res.count
}

/**
 * ابطال اجباری نشست‌های کاربر توسط ادمین:
 * غیرفعال‌سازی حساب / تغییر رمز / تغییر نقش → همهٔ نشست‌ها باطل می‌شوند.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } })
}

// ─────────────────────────── Cleanup نشست‌های منقضی ───────────────────────────

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // حداکثر هر یک ساعت یک‌بار
let lastCleanup = 0

/** پاک‌سازی دوره‌ای نشست‌های منقضی — throttle شده تا هزینهٔ DB ثابت بماند */
export async function scheduleExpiredSessionCleanup(): Promise<void> {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  try {
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  } catch {
    // پاک‌سازی هرگز جریان اصلی (ورود) را نباید شکست دهد
  }
}

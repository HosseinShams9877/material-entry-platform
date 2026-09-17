import { NextRequest, NextResponse } from 'next/server'
import { ZodType } from 'zod'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { hasPermission, type PermissionKey } from '@/lib/permissions'
import { rateLimit } from '@/lib/ratelimit'
import { TRUST_PROXY } from '@/lib/env'
import { logger, safeErrorMeta } from '@/lib/logger'

// ─────────────────────────── پاسخ استاندارد خطا ───────────────────────────

export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init)
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ success: false, code, message }, { status })
}

/**
 * IP واقعی کلاینت — هدرهای Proxy فقط وقتی خوانده می‌شوند که سرور پشت
 * Reverse Proxy مورد اعتماد باشد (TRUST_PROXY=true). در غیر این صورت
 * هدر x-forwarded-for قابل جعل است و برای Rate Limit استفاده نمی‌شود.
 */
export function clientIp(req: NextRequest): string {
  if (TRUST_PROXY) {
    return (
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    )
  }
  // بدون Proxy معتمد: سوکت مستقیم؛ Next آدرس را در دسترس نمی‌گذارد
  return 'direct'
}

// ─────────────────────────── CSRF / Origin ───────────────────────────

/** برای متدهای تغییردهنده: Origin باید هم‌مبدا باشد + هدر سفارشی X-Requested-With */
function assertCsrf(req: NextRequest): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
  const origin = req.headers.get('origin')
  if (origin) {
    const host = req.headers.get('host')
    try {
      const originHost = new URL(origin).host
      if (host && originHost !== host) {
        throw new ApiError(403, 'CSRF_BLOCKED', 'درخواست از مبداول غیرمجاز رد شد.')
      }
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw new ApiError(403, 'CSRF_BLOCKED', 'درخواست نامعتبر است.')
    }
  }
  if (req.headers.get('x-requested-with') !== 'XMLHttpRequest') {
    throw new ApiError(403, 'CSRF_BLOCKED', 'درخواست فاقد نشان امنیتی است.')
  }
}

// ─────────────────────────── Handler Wrapper ───────────────────────────

export interface HandlerCtx<TBody = unknown> {
  req: NextRequest
  user: SessionUser
  body: TBody
  params: Record<string, string>
  ip: string
  userAgent: string
}

interface Options<TBody> {
  /** نیازمند نشست کاربر؟ (پیش‌فرض true) */
  auth?: boolean
  permission?: PermissionKey
  /** اسکیمای Zod برای بدنه درخواست */
  schema?: ZodType<TBody>
  /** محدودیت نرخ: [حداکثر تعداد، پنجره میلی‌ثانیه، کلید سفارشی] */
  rateLimit?: { limit: number; windowMs: number; scope?: string }
  /** بررسی Origin/CSRF (پیش‌فرض برای متدهای تغییردهنده فعال است) */
  skipCsrf?: boolean
}

/**
 * Wrapper واحد تمام APIها:
 * Rate Limit → CSRF → Auth → RBAC → Zod Validation → Handler → Error Formatting
 */
export function apiHandler<TBody = unknown>(
  fn: (ctx: HandlerCtx<TBody>) => Promise<NextResponse>,
  options: Options<TBody> = {}
) {
  return async (req: NextRequest, routeCtx?: { params?: Promise<Record<string, string>> }): Promise<NextResponse> => {
    const ip = clientIp(req)
    const userAgent = req.headers.get('user-agent') ?? 'unknown'
    try {
      // 1) Rate Limit
      if (options.rateLimit) {
        const { limit, windowMs, scope = '' } = options.rateLimit
        if (!rateLimit(`${scope}:${ip}`, limit, windowMs)) {
          throw new ApiError(429, 'RATE_LIMITED', 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.')
        }
      }

      // 2) CSRF
      if (!options.skipCsrf) assertCsrf(req)

      // 3) Auth
      let user: SessionUser | null = null
      const needsAuth = options.auth !== false
      if (needsAuth) {
        user = await getSessionUser(userAgent)
        if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'برای ادامه باید وارد حساب کاربری شوید.')
      }

      // 4) RBAC
      if (options.permission) {
        if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'برای ادامه باید وارد حساب کاربری شوید.')
        if (!hasPermission(user.role, options.permission)) {
          throw new ApiError(403, 'FORBIDDEN', 'شما اجازه انجام این عملیات را ندارید.')
        }
      }

      // 5) Params
      const params: Record<string, string> = routeCtx?.params ? await routeCtx.params : {}

      // 6) Validation
      let body: TBody = undefined as TBody
      if (options.schema) {
        let raw: unknown = {}
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const contentType = req.headers.get('content-type') ?? ''
          if (contentType.includes('application/json')) {
            raw = await req.json().catch(() => ({}))
          }
        } else {
          raw = Object.fromEntries(req.nextUrl.searchParams)
        }
        const parsed = options.schema.safeParse(raw)
        if (!parsed.success) {
          const first = parsed.error.issues[0]
          const field = first?.path?.join('.') ?? ''
          throw new ApiError(
            422,
            'VALIDATION_ERROR',
            first?.message ? `${first.message}${field ? ` (${field})` : ''}` : 'اطلاعات ارسالی معتبر نیست.'
          )
        }
        body = parsed.data
      }

      // 7) Handler
      return await fn({ req, user: user as SessionUser, body, params, ip, userAgent })
    } catch (err) {
      return formatError(err)
    }
  }
}

export function formatError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error('api', err.code, { status: err.status })
    }
    return fail(err.status, err.code, err.message)
  }
  // خطای داخلی سیستم — جزئیات فقط در لاگ سرور؛ پیام داخلی هرگز به کاربر نمی‌رود
  logger.error('api', 'unexpected error', safeErrorMeta(err))
  return fail(500, 'INTERNAL_ERROR', 'خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.')
}

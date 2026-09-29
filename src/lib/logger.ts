// ─────────────────────────── Logger ساختاریافته ───────────────────────────
// خروجی JSON تک‌خطی (قابل جمع‌آوری توسط Loki/ELK/CloudWatch).
// کلیدهای حساس (password/token/secret/hash/cookie) خودکار قرمط می‌شوند.

const SENSITIVE_KEYS = [
  'password', 'passwordhash', 'token', 'tokenhash', 'secret', 'signedurlsecret',
  'cookie', 'authorization', 'apikey', 'api_key', 'session', 'credentials',
]

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1)
    }
    return out
  }
  return value
}

function emit(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...(meta ? { meta: redact(meta) as Record<string, unknown> } : {}),
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (scope: string, msg: string, meta?: Record<string, unknown>) => emit('debug', scope, msg, meta),
  info: (scope: string, msg: string, meta?: Record<string, unknown>) => emit('info', scope, msg, meta),
  warn: (scope: string, msg: string, meta?: Record<string, unknown>) => emit('warn', scope, msg, meta),
  error: (scope: string, msg: string, meta?: Record<string, unknown>) => emit('error', scope, msg, meta),
}

/** پیام خطای امن برای لاگ — از نشت stack حاوی دادهٔ حساس جلوگیری می‌کند */
export function safeErrorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message }
  }
  return { raw: String(err).slice(0, 500) }
}

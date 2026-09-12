"use client"

// ─────────────────────────── Offline Outbox (Enterprise PWA) ───────────────────────────
// صف درخواست‌های تغییردهنده در IndexedDB:
// - هر آیتم یک clientRequestId یکتا دارد → سرور Idempotent است (ضد داده تکراری)
// - Sync خودکار: بازگشت اتصال (online)، تایمر دوره‌ای، پیام Background Sync از SW
// - موفقیت/تکرار → حذف از صف؛ خطای شبکه → ماندن در صف برای تلاش بعدی

const DB_NAME = 'smi-offline'
const DB_VERSION = 1
const STORE_OUTBOX = 'outbox'
const STORE_CACHE = 'read-cache'
export const OFFLINE_QUEUED_CODE = 'OFFLINE_QUEUED'

/** اندپوینت‌هایی که در Offline صف می‌شوند (Idempotent از سمت سرور) */
export const QUEUEABLE_ENDPOINTS: Array<{ pattern: RegExp; kind: string }> = [
  { pattern: /^\/api\/v1\/material-entries\/?$/, kind: 'entry' },
  { pattern: /^\/api\/v1\/daily-reports\/?$/, kind: 'report' },
]

interface OutboxItem {
  id: string // clientRequestId (UUID)
  url: string
  method: string
  body: string | null
  kind: string
  createdAt: number
  attempts: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexeddb failed'))
  })
}

async function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = run(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexeddb tx failed'))
    t.oncomplete = () => db.close()
  })
}

export async function enqueueRequest(item: Omit<OutboxItem, 'attempts'>): Promise<void> {
  await tx(STORE_OUTBOX, 'readwrite', (s) => s.put({ ...item, attempts: 0 } as OutboxItem))
}

export async function getOutboxCount(): Promise<number> {
  return tx(STORE_OUTBOX, 'readonly', (s) => s.count())
}

async function listOutbox(): Promise<OutboxItem[]> {
  return tx(STORE_OUTBOX, 'readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>)
}

async function removeOutbox(id: string): Promise<void> {
  await tx(STORE_OUTBOX, 'readwrite', (s) => s.delete(id))
}

/**
 * پردازش صف — همهٔ آیتم‌های صف با fetch مستقیم ارسال می‌شوند.
 * پاسخ موفق یا تکراری (duplicate:true) → حذف؛ خطای شبکه → ماندن.
 * خروجی: تعداد آیتم‌های باقی‌مانده.
 */
export async function processOutbox(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return getOutboxCount()
  const items = await listOutbox()
  let remaining = items.length
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(item.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: item.body,
        credentials: 'same-origin',
      })
      let json: { success?: boolean; data?: { duplicate?: boolean }; code?: string } = {}
      try {
        json = await res.json()
      } catch {
        /* پاسخ خالی */
      }
      if (res.ok && json.success !== false) {
        // موفق یا تکراری — هر دو یعنی داده روی سرور است
        await removeOutbox(item.id)
        remaining -= 1
        window.dispatchEvent(new CustomEvent('smi:outbox-synced', { detail: { id: item.id, duplicate: json.data?.duplicate === true } }))
      } else if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
        // خطای اعتبارسنجی/مجوز — تلاش مجدد بی‌فایده است؛ از صف حذف می‌شود
        await removeOutbox(item.id)
        remaining -= 1
        window.dispatchEvent(new CustomEvent('smi:outbox-dropped', { detail: { id: item.id, code: json.code ?? 'UNKNOWN' } }))
      }
    } catch {
      // خطای شبکه — آیتم در صف می‌ماند
    }
  }
  return remaining
}

/** آیا این مسیر/بدنه در Offline صف‌شدنی است؟ */
export function matchQueueable(path: string, body: unknown): { kind: string } | null {
  const hit = QUEUEABLE_ENDPOINTS.find((q) => q.pattern.test(path))
  if (!hit) return null
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  if (!('clientRequestId' in b) || typeof b.clientRequestId !== 'string' || !b.clientRequestId) return null
  return { kind: hit.kind }
}

/** صف‌کردن یک درخواست JSON با clientRequestId */
export async function queueJson(path: string, body: unknown): Promise<void> {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const clientRequestId = typeof b.clientRequestId === 'string' && b.clientRequestId ? b.clientRequestId : crypto.randomUUID()
  await enqueueRequest({
    id: clientRequestId,
    url: path,
    method: 'POST',
    body: JSON.stringify({ ...b, clientRequestId }),
    kind: matchQueueable(path, b)?.kind ?? 'generic',
    createdAt: Date.now(),
  })
}

// ─────────────────────────── Read Cache (Offline Reads) ───────────────────────────

export async function cacheRead(key: string, data: unknown): Promise<void> {
  try {
    await tx(STORE_CACHE, 'readwrite', (s) => s.put({ data, at: Date.now() }, key))
  } catch {
    /* cache اختلافی نیست */
  }
}

export async function readCached<T>(key: string): Promise<T | null> {
  try {
    const row = await tx<{ data: T; at: number } | undefined>(STORE_CACHE, 'readonly', (s) => s.get(key))
    return row?.data ?? null
  } catch {
    return null
  }
}

// ─────────────────────────── نصب شنونده‌های Sync ───────────────────────────

let installed = false

/** شنونده‌های Sync — یک‌بار در Shell فراخوانی می‌شود */
export function installOfflineSync(onChange?: (count: number) => void): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const sync = async () => {
    const count = await processOutbox()
    onChange?.(count)
  }
  const refresh = async () => {
    const count = await getOutboxCount()
    onChange?.(count)
  }

  window.addEventListener('online', () => void sync())
  window.addEventListener('offline', () => void refresh())
  setInterval(() => void processOutbox(), 30_000)
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if ((e.data as { type?: string })?.type === 'OUTBOX_SYNC') void sync()
  })
  void refresh()
}

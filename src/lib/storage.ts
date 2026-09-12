import { createHash, createHmac } from 'node:crypto'
import { readFile, unlink, stat, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR } from '@/lib/env'
import { logger } from '@/lib/logger'

// ─────────────────────────── لایهٔ انتزاع Object Storage (Enterprise) ───────────────────────────
// منبع ذخیرهٔ فایل‌های خصوصی قابل جابه‌جایی:
//   STORAGE_PROVIDER=local (پیش‌فرض) → فایل‌سیستم محلی UPLOAD_DIR
//   STORAGE_PROVIDER=s3             → هر سرویس سازگار S3 (AWS S3 / MinIO / Wasabi / …)
//   STORAGE_PROVIDER=blob           → Vercel Blob (برای دیپلوی روی Vercel)
// کلیدهای دسترسی فقط از Environment می‌آیند و هرگز در کد یا پاسخ API ظاهر نمی‌شوند.

export type StorageProviderKind = 'LOCAL' | 'S3' | 'BLOB'

export interface ObjectStorage {
  readonly provider: StorageProviderKind
  /** ذخیرهٔ بایت‌ها با کلید سرساخت */
  put(key: string, bytes: Buffer): Promise<void>
  /** خواندن کامل شیء (برای پاسخ‌دهی امن از مسیر API) */
  get(key: string): Promise<Buffer>
  /** حذف شیء — غایب بودن، خطا محسوب نمی‌شود */
  delete(key: string): Promise<void>
  /** فقط ارائه‌دهندهٔ محلی: مسیر مطلق برای Streaming — S3/Blob همیشه null */
  absolutePath(key: string): string | null
}

// ─────────────────────────── Local ───────────────────────────

async function ensureDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true }).catch(() => undefined)
}

class LocalObjectStorage implements ObjectStorage {
  readonly provider = 'LOCAL' as const

  resolve(key: string): string {
    const resolved = path.resolve(path.isAbsolute(key) ? key : path.join(UPLOAD_DIR, key))
    if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
      throw new Error('PATH_CONTAINMENT')
    }
    return resolved
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    await ensureDir()
    const { writeFile } = await import('node:fs/promises')
    await writeFile(this.resolve(key), bytes)
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key))
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined)
  }

  absolutePath(key: string): string | null {
    return this.resolve(key)
  }
}

// ─────────────────────────── Vercel Blob ───────────────────────────

class VercelBlobStorage implements ObjectStorage {
  readonly provider = 'BLOB' as const

  private async sdk() {
    // import تنبل تا SDK از باندل Edge خارج بماند
    return await import('@vercel/blob')
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const { put } = await this.sdk()
    await put(key, bytes, {
      access: 'public', // یا 'private' اگر سیاست شما الزام می‌کند
      addRandomSuffix: false,
    })
  }

  async get(key: string): Promise<Buffer> {
    const { get } = await this.sdk()
    const result = await get(key, { access: 'public' })
    if (!result || !result.stream) throw new Error('NOT_FOUND')
    const chunks: Uint8Array[] = []
    // @ts-expect-error — ReadableStream در Node 18+ قابل async-iterate است
    for await (const chunk of result.stream) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  async delete(key: string): Promise<void> {
    const { del } = await this.sdk()
    await del(key).catch(() => undefined)
  }

  absolutePath(): string | null {
    return null // Blob فقط از مسیر API سرو می‌شود
  }
}

// ─────────────────────────── S3 / MinIO (SigV4) ───────────────────────────

const S3_ENDPOINT = process.env.S3_ENDPOINT?.trim() || ''
const S3_REGION = process.env.S3_REGION?.trim() || 'us-east-1'
const S3_BUCKET = process.env.S3_BUCKET?.trim() || ''
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY_ID?.trim() || ''
const S3_SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY?.trim() || ''
const S3_FORCE_PATH_STYLE = ['1', 'true', 'yes', 'on'].includes((process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase())

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

class S3ObjectStorage implements ObjectStorage {
  readonly provider = 'S3' as const

  constructor() {
    if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
      throw new Error(
        'STORAGE_PROVIDER=s3 نیازمند S3_BUCKET، S3_ACCESS_KEY_ID و S3_SECRET_ACCESS_KEY است. ' +
          'این مقادیر را در Environment تنظیم کنید یا STORAGE_PROVIDER=local بگذارید.'
      )
    }
  }

  private endpointFor(key: string): { url: URL; hostHeader: string } {
    const base = S3_ENDPOINT || `https://s3.${S3_REGION}.amazonaws.com`
    const clean = base.replace(/\/+$/, '')
    if (S3_FORCE_PATH_STYLE || !S3_ENDPOINT) {
      const url = new URL(`${clean}/${S3_BUCKET}/${encodeURI(key)}`)
      return { url, hostHeader: url.host }
    }
    const url = new URL(`${clean.replace('://', `://${S3_BUCKET}.`)}/${encodeURI(key)}`)
    return { url, hostHeader: url.host }
  }

  private signedHeaders(method: string, key: string, payload: Buffer | null): HeadersInit {
    const { url, hostHeader } = this.endpointFor(key)
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.slice(0, 8)
    const payloadHash = payload ? sha256Hex(payload) : sha256Hex(Buffer.alloc(0))

    const canonicalHeaders =
      `host:${hostHeader}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

    const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
    const scope = `${dateStamp}/${S3_REGION}/s3/aws4_request`
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')

    const kDate = hmac(`AWS4${S3_SECRET_KEY}`, dateStamp)
    const kRegion = hmac(kDate, S3_REGION)
    const kService = hmac(kRegion, 's3')
    const kSigning = hmac(kService, 'aws4_request')
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

    return {
      host: hostHeader,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${S3_ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    }
  }

  private objectUrl(key: string): URL {
    return this.endpointFor(key).url
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const res = await fetch(this.objectUrl(key), {
      method: 'PUT',
      headers: this.signedHeaders('PUT', key, bytes),
      body: new Uint8Array(bytes),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      logger.error('storage', `S3 put failed ${res.status}`, { detail: detail.slice(0, 300) })
      throw new Error(`S3_PUT_FAILED_${res.status}`)
    }
  }

  async get(key: string): Promise<Buffer> {
    const res = await fetch(this.objectUrl(key), {
      method: 'GET',
      headers: this.signedHeaders('GET', key, null),
    })
    if (!res.ok) {
      if (res.status === 404) throw new Error('NOT_FOUND')
      throw new Error(`S3_GET_FAILED_${res.status}`)
    }
    return Buffer.from(await res.arrayBuffer())
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(this.objectUrl(key), {
      method: 'DELETE',
      headers: this.signedHeaders('DELETE', key, null),
    }).catch(() => null)
    if (res && !res.ok && res.status !== 404) {
      throw new Error(`S3_DELETE_FAILED_${res.status}`)
    }
  }

  absolutePath(): string | null {
    return null
  }
}

// ─────────────────────────── Singleton ───────────────────────────

let instance: ObjectStorage | null = null

export function getStorage(): ObjectStorage {
  if (instance) return instance
  const raw = (process.env.STORAGE_PROVIDER ?? 'local').trim().toLowerCase()
  if (raw === 's3') {
    instance = new S3ObjectStorage()
  } else if (raw === 'blob') {
    instance = new VercelBlobStorage()
  } else if (raw === 'local') {
    instance = new LocalObjectStorage()
  } else {
    throw new Error(`مقدار STORAGE_PROVIDER نامعتبر است: "${raw}". مقادیر مجاز: local | s3 | blob`)
  }
  logger.info('storage', `object storage ready: ${instance.provider}`)
  return instance
}

export async function openStoredObject(
  key: string
): Promise<{ kind: 'stream'; absolutePath: string } | { kind: 'buffer'; bytes: Buffer }> {
  const storage = getStorage()
  if (storage.provider === 'LOCAL') {
    const abs = storage.absolutePath(key)
    if (!abs) throw new Error('NOT_FOUND')
    const s = await stat(abs).catch(() => null)
    if (!s || !s.isFile()) throw new Error('NOT_FOUND')
    return { kind: 'stream', absolutePath: abs }
  }
  return { kind: 'buffer', bytes: await storage.get(key) }
}

export function activeStorageProvider(): StorageProviderKind {
  return getStorage().provider
}
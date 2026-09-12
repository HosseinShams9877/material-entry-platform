import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { AUDIO_MAX_MB } from '@/lib/env'
import { UploadValidationError, resolveStoragePath, ensureUploadDir } from '@/lib/upload'

// ─────────────────────────── ذخیرهٔ امن فایل صوتی ماژول روزانه ───────────────────────────
// چندلایه: Magic Bytes (نوع واقعی صوت) → هم‌خوانی MIME اعلانی + پسوند → سقف حجم →
// نام سرساخت → مهار مسیر داخل UPLOAD_DIR. فایل هرگز public نمی‌شود و پخش فقط
// با Signed URL یا نشست دارای Scope انجام می‌شود.

export const MAX_AUDIO_SIZE = AUDIO_MAX_MB * 1024 * 1024

/** الگو: خارجی‌ها «یا» هستند، درونی‌ها «و» (چند موقعیت هم‌زمان) */
export interface AllowedAudioType {
  mime: string
  extensions: string[]
  alternatives: Array<Array<{ offset: number; bytes: number[] }>>
}

/**
 * فرمت‌های مجاز صوت. تشخیص مستقل از file.type کلاینت:
 * - MP3: برچسب ID3 یا فریم MPEG sync
 * - WAV: RIFF….WAVE
 * - WebM/Matroska: EBML header
 * - Ogg: OggS
 * - MP4/M4A: ftyp + برندهای صوتی رایج
 */
export const ALLOWED_AUDIO_TYPES: AllowedAudioType[] = [
  {
    mime: 'audio/mpeg',
    extensions: ['.mp3', '.mpeg', '.mpga'],
    alternatives: [
      [{ offset: 0, bytes: [0x49, 0x44, 0x33] }], // "ID3"
      [{ offset: 0, bytes: [0xff, 0xfb] }], // MPEG frame sync
      [{ offset: 0, bytes: [0xff, 0xf3] }],
      [{ offset: 0, bytes: [0xff, 0xf2] }],
    ],
  },
  {
    mime: 'audio/wav',
    extensions: ['.wav'],
    alternatives: [
      [
        { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
        { offset: 8, bytes: [0x57, 0x41, 0x56, 0x45] }, // "WAVE"
      ],
    ],
  },
  {
    mime: 'audio/webm',
    extensions: ['.webm'],
    alternatives: [[{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }]], // EBML
  },
  {
    mime: 'audio/ogg',
    extensions: ['.ogg', '.oga', '.opus'],
    alternatives: [[{ offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }]], // "OggS"
  },
  {
    mime: 'audio/mp4',
    extensions: ['.m4a', '.mp4', '.aac'],
    alternatives: [[{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }]], // "ftyp" at offset 4
  },
]

const MP4_AUDIO_BRANDS = ['M4A ', 'M4B ', 'isom', 'iso2', 'mp41', 'mp42', 'dash', 'avc1']

function patternsMatch(bytes: Uint8Array, patterns: Array<{ offset: number; bytes: number[] }>): boolean {
  return patterns.every(
    (p) => bytes.length >= p.offset + p.bytes.length && p.bytes.every((b, i) => bytes[p.offset + i] === b)
  )
}

/** نوع واقعی صوت را از بایت‌ها تشخیص می‌دهد؛ عدم تطابق → null */
export function sniffAudioMime(bytes: Uint8Array): string | null {
  for (const t of ALLOWED_AUDIO_TYPES) {
    if (!t.alternatives.some((alt) => patternsMatch(bytes, alt))) continue
    // فایل‌های mp4/video نیز ftyp دارند — فقط برندهای صوتی/رایج را بپذیر
    if (t.mime === 'audio/mp4') {
      const brand = String.fromCharCode(...bytes.slice(8, 12))
      if (!MP4_AUDIO_BRANDS.includes(brand)) continue
    }
    return t.mime
  }
  return null
}

/**
 * اعتبارسنجی کامل فایل صوتی (خواندن + Magic Bytes + MIME + پسوند + حجم).
 * برخلاف تصاویر، صوت با Sharp بازپردازش نمی‌شود.
 */
export async function validateAudio(file: File): Promise<{ bytes: Buffer; mime: string; ext: string; size: number }> {
  if (file.size === 0) {
    throw new UploadValidationError(422, 'EMPTY_AUDIO', 'فایل صوتی خالی است.')
  }
  if (file.size > MAX_AUDIO_SIZE) {
    throw new UploadValidationError(413, 'AUDIO_TOO_LARGE', `حجم فایل صوتی بیش از ${AUDIO_MAX_MB} مگابایت است.`)
  }

  const declaredMime = (file.type || 'application/octet-stream').toLowerCase()
  const allowed = ALLOWED_AUDIO_TYPES.find((t) => t.mime === declaredMime)
  if (!allowed) {
    throw new UploadValidationError(415, 'UNSUPPORTED_AUDIO', 'فقط فرمت‌های صوتی MP3/WAV/WebM/OGG/M4A پذیرفته می‌شود.')
  }

  const originalExt = path.extname(file.name || '').toLowerCase()
  if (originalExt && !allowed.extensions.includes(originalExt)) {
    throw new UploadValidationError(415, 'EXTENSION_MISMATCH', 'پسوند فایل با نوع صوتی اعلام‌شده هم‌خوانی ندارد.')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0) {
    throw new UploadValidationError(422, 'EMPTY_AUDIO', 'فایل صوتی خالی است.')
  }

  // لایهٔ نهایی — Magic Bytes: نوع اعلانی باید با محتوای واقعی یکی باشد
  const sniffed = sniffAudioMime(bytes)
  if (!sniffed || sniffed !== declaredMime) {
    throw new UploadValidationError(415, 'MIME_SPOOFED', 'محتوای فایل با نوع صوتی اعلام‌شده هم‌خوانی ندارد.')
  }

  return { bytes, mime: declaredMime, ext: originalExt || allowed.extensions[0], size: bytes.length }
}

/** ذخیرهٔ فایل صوتی با نام سرساخت داخل UPLOAD_DIR — نام کاربر هرگز استفاده نمی‌شود */
export async function storeAudioFile(
  processed: { bytes: Buffer; ext: string; mime: string }
): Promise<{ storagePath: string; size: number; mime: string; fileName: string }> {
  await ensureUploadDir()
  const storageName = `audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${processed.ext}`
  const absolute = resolveStoragePath(storageName)
  await writeFile(absolute, processed.bytes)
  return {
    storagePath: storageName,
    size: processed.bytes.length,
    mime: processed.mime,
    fileName: `voice-${new Date().toISOString().slice(0, 10)}${processed.ext}`,
  }
}

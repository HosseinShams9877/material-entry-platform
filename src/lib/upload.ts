import { mkdir, writeFile, unlink, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { UPLOAD_DIR, PUBLIC_UPLOADS_DIR } from '@/lib/env'

// ─────────────────────────── ذخیرهٔ امن فایل پیوست ───────────────────────────
// چندلایه: Magic Bytes (نوع واقعی) → بازپردازش Sharp (حذف متادیتا/EXIF) →
// نام ذخیرهٔ سرساخت (هرگز از نام کاربر) → مسیر مهارشده داخل UPLOAD_DIR →
// هم‌خوانی MIME اعلانی + پسوند + حجم.

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024 // 10MB

/** امضاهای باینری مجاز — تشخیص نوع واقعی مستقل از file.type کلاینت */
export interface AllowedType {
  mime: string
  extensions: string[]
  /** تصاویر بازپردازش‌شدنی با sharp؛ false یعنی فقط Magic Check (PDF/HEIC) */
  reprocess: boolean
  /** تشخیص Magic Bytes؛ null یعنی offset */
  magic: Array<{ offset: number; bytes: number[] }>
}

export const ALLOWED_TYPES: AllowedType[] = [
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'], reprocess: true, magic: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { mime: 'image/png', extensions: ['.png'], reprocess: true, magic: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }] },
  {
    mime: 'image/webp', extensions: ['.webp'], reprocess: true,
    magic: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
    ],
  },
  { mime: 'image/heic', extensions: ['.heic'], reprocess: false, magic: [] }, // برند ftyp پایین‌تر بررسی می‌شود
  { mime: 'application/pdf', extensions: ['.pdf'], reprocess: false, magic: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }] }, // %PDF
]

export function matchAllowedType(mime: string): AllowedType | null {
  return ALLOWED_TYPES.find((t) => t.mime === mime) ?? null
}

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'mif1']

function isHeic(bytes: Uint8Array): boolean {
  const ftyp = bytes.slice(4, 8)
  if (ftyp.length !== 4 || ftyp[0] !== 0x66 || ftyp[1] !== 0x74 || ftyp[2] !== 0x79 || ftyp[3] !== 0x70) return false
  const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase()
  return HEIC_BRANDS.some((b) => brand.startsWith(b))
}

/** sniff نوع واقعی از بایت‌ها؛ در صورت عدم تطابق null */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 12 && isHeic(bytes)) return 'image/heic'
  for (const t of ALLOWED_TYPES) {
    if (t.magic.length === 0) continue
    const ok = t.magic.every(
      (m) => bytes.length >= m.offset + m.bytes.length && m.bytes.every((b, i) => bytes[m.offset + i] === b)
    )
    if (ok) return t.mime
  }
  return null
}

export class UploadValidationError extends Error {
  status: number
  code: string
  faMessage: string
  constructor(status: number, code: string, faMessage: string) {
    super(code)
    this.status = status
    this.code = code
    this.faMessage = faMessage
  }
}

/**
 * اعتبارسنجی چندلایه + بازپردازش تصویر.
 * خروجی: بایت‌های نهایی برای ذخیره + MIME واقعی تشخیص‌داده‌شده.
 * - JPEG/PNG/WebP: با sharp باز Encode می‌شوند → EXIF/GPS و payloadهای مخفی حذف می‌شود.
 *   اگر sharp نتوانست Decode کند فایل رد می‌شود (محتوای خراب/مشکوک).
 * - HEIC/PDF: sharp پشتیبانی نمی‌کند → فقط Magic Bytes + MIME اعلانی + پسوند.
 */
export async function validateAndProcess(file: File): Promise<{ bytes: Buffer; mime: string; ext: string; size: number }> {
  if (file.size === 0) throw new UploadValidationError(422, 'EMPTY_FILE', 'فایل خالی است.')
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new UploadValidationError(413, 'FILE_TOO_LARGE', 'حجم فایل بیش از ۱۰ مگابایت است.')
  }

  const declaredMime = (file.type || 'application/octet-stream').toLowerCase()
  const allowed = matchAllowedType(declaredMime)
  if (!allowed) {
    throw new UploadValidationError(415, 'UNSUPPORTED_TYPE', 'فقط تصویر (JPG/PNG/WebP/HEIC) یا PDF پذیرفته می‌شود.')
  }

  const originalExt = path.extname(file.name || '').toLowerCase()
  if (originalExt && !allowed.extensions.includes(originalExt)) {
    throw new UploadValidationError(415, 'EXTENSION_MISMATCH', 'پسوند فایل با نوع فایل هم‌خوانی ندارد.')
  }

  const raw = Buffer.from(await file.arrayBuffer())
  if (raw.length === 0) throw new UploadValidationError(422, 'EMPTY_FILE', 'فایل خالی است.')

  // لایهٔ ۱ — Magic Bytes: نوع اعلانی باید با محتوای واقعی یکی باشد
  const sniffed = sniffMime(raw)
  if (!sniffed || sniffed !== declaredMime) {
    throw new UploadValidationError(415, 'MIME_SPOOFED', 'محتوای فایل با نوع اعلام‌شده هم‌خوانی ندارد.')
  }

  // لایهٔ ۲ — بازپردازش تصاویر با sharp: Re-encode کامل → EXIF/GPS/Thumbnail و
  // payloadهای جاسازی‌شده حذف می‌شوند (sharp به‌صورت پیش‌فرض فقط پیکسل‌ها را می‌برد)
  if (allowed.reprocess) {
    try {
      const image = sharp(raw, { failOn: 'error' }).rotate() // EXIF orientation اعمال می‌شود
      const withMeta = await image.metadata()
      if (!withMeta.width || !withMeta.height) {
        throw new Error('no dimensions')
      }
      let out: Buffer
      if (declaredMime === 'image/jpeg') {
        out = await image.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      } else if (declaredMime === 'image/png') {
        out = await image.png({ compressionLevel: 9 }).toBuffer()
      } else {
        out = await image.webp({ quality: 85 }).toBuffer()
      }
      return { bytes: out, mime: declaredMime, ext: allowed.extensions[0], size: out.length }
    } catch {
      throw new UploadValidationError(415, 'CORRUPT_IMAGE', 'فایل تصویر خراب است یا قابل پردازش نیست.')
    }
  }

  return { bytes: raw, mime: declaredMime, ext: originalExt || allowed.extensions[0], size: raw.length }
}

// ─────────────────────────── بخش‌های ذخیرهٔ تصاویر عمومی (public/uploads) ───────────────────────────
// هر بخش فقط به زیرپوشهٔ خودش می‌نویسد — جداسازی داده‌ها و مرز امنیتی مسیر:
//  • purchase-requests → فاکتورهای درخواست خرید (POST /purchase-requests/[id]/invoice)
//  • work-reports      → عکس‌های گزارش کار کارگران (entityType=WORK_REPORT)
//  • material-entries  → پیوست‌های ثبت ورود مصالح (entityType=ENTRY با direction=IN)
//  • material-exits    → پیوست‌های ثبت خروج مصالح (entityType=ENTRY با direction=OUT)
//  • daily-tasks       → عکس‌های اثبات انجام وظیفه (POST /daily-tasks/items/[id]/photo)
//  • statements        → تصویر امضای مدیر روی صورت وضعیت (POST /statements/[id]/sign)
// بخش «approvals» پوشهٔ مجزایی ندارد: فرآیند تأأییدیه روی ثبت‌ها اعمال می‌شود و
// مدارک بارگذاری‌شده در دل آن (مثلاً نسخه‌گذاری پیوست) در همان پوشهٔ ثبتِ مربوطه
// (material-entries / material-exits) ذخیره می‌شوند.
export type UploadSection =
  | 'purchase-requests'
  | 'work-reports'
  | 'material-entries'
  | 'material-exits'
  | 'daily-tasks'
  | 'statements'

export const UPLOAD_SECTIONS: UploadSection[] = [
  'purchase-requests',
  'work-reports',
  'material-entries',
  'material-exits',
  'daily-tasks',
  'statements',
]

/**
 * آیا مسیر ذخیره‌شده شکلِ بخش‌دار دارد («<section>/<filename>»)؟
 * مسیرهای تخت (فقط نام فایل) سبک قدیمیِ UPLOAD_DIR هستند و همچنان به همان شکل
 * خصوصی و از طریق Signed URL سرو می‌شوند.
 */
function isSectionStoragePath(storagePath: string): boolean {
  const first = storagePath.split(/[\\/]/, 1)[0]
  return (UPLOAD_SECTIONS as string[]).includes(first)
}

/**
 * تبدیل مسیر ذخیرهٔ بخش‌دار به URL عمومی — Next.js فایل را از public سرو می‌کند.
 * مسیرهای قدیمی (تخت) null برمی‌گردانند تا فراخوان متفیر به Signed URL قدیمی برود.
 */
export function publicFileUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath || !isSectionStoragePath(storagePath)) return null
  return `/uploads/${storagePath.split(/[\\/]/).join('/')}`
}

/** اطمینان از مهار بودن مسیر داخل UPLOAD_DIR — دفاع در برابر Path Traversal */
export function resolveStoragePath(storagePath: string): string {
  // مسیرهای بخش‌دار («<section>/<filename>») → زیرپوشهٔ public/uploads
  if (isSectionStoragePath(storagePath)) {
    const resolved = path.resolve(
      path.isAbsolute(storagePath) ? storagePath : path.join(PUBLIC_UPLOADS_DIR, storagePath)
    )
    if (resolved === PUBLIC_UPLOADS_DIR || !resolved.startsWith(PUBLIC_UPLOADS_DIR + path.sep)) {
      throw new UploadValidationError(500, 'PATH_CONTAINMENT', 'مسیر فایل نامعتبر است.')
    }
    return resolved
  }
  // سبک قدیمی — نام تخت داخل UPLOAD_DIR خصوصی
  const resolved = path.resolve(path.isAbsolute(storagePath) ? storagePath : path.join(UPLOAD_DIR, storagePath))
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw new UploadValidationError(500, 'PATH_CONTAINMENT', 'مسیر فایل نامعتبر است.')
  }
  return resolved
}

let dirEnsured = false
export async function ensureUploadDir(): Promise<void> {
  if (dirEnsured) {
    await stat(UPLOAD_DIR).catch(async () => mkdir(UPLOAD_DIR, { recursive: true }))
    return
  }
  await mkdir(UPLOAD_DIR, { recursive: true })
  dirEnsured = true
}

const ensuredSections = new Set<string>()
/** ساخت زیرپوشهٔ بخش در public/uploads (هر بخش یک‌بار در هر پردازه) */
export async function ensureSectionDir(section: UploadSection): Promise<void> {
  if (ensuredSections.has(section)) return
  await mkdir(path.join(PUBLIC_UPLOADS_DIR, section), { recursive: true })
  ensuredSections.add(section)
}

export interface StoredFile {
  /**
   * مسیر نسبی — برای فایل‌های جدید: «<section>/<filename>» (همیشه با /، URL-دوست)؛
   * برای رکوردهای قدیمی: نام تخت داخل UPLOAD_DIR.
   */
  storagePath: string
  size: number
  mime: string
  fileName: string // نام نمایشی امن برای کاربر
}

/**
 * ذخیرهٔ فایل با نام سرساخت در زیرپوشهٔ بخش مربوطه — نام اصلی کاربر هرگز در
 * filesystem استفاده نمی‌شود (نه Path Traversal، نه برخورد، نه نشت اطلاعات در نام فایل).
 * نام یکتا: timestamp + عدد تصادفی + پسوند اصلی (هرگز نام کاربر).
 */
export async function storeAttachmentFile(
  processed: { bytes: Buffer; ext: string; mime: string },
  displayFileName: string,
  section: UploadSection
): Promise<StoredFile> {
  await ensureSectionDir(section)
  const storageName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${processed.ext}`
  const storagePath = `${section}/${storageName}`
  const absolute = resolveStoragePath(storagePath)
  await writeFile(absolute, processed.bytes)
  return {
    storagePath,
    size: processed.bytes.length,
    mime: processed.mime,
    fileName: (displayFileName || `file${processed.ext}`).replace(/[\r\n]/g, '').slice(0, 200),
  }
}

/** حذف امن فایل ذخیره‌شده — برای Rollback خطای DB و حذف Attachment */
export async function removeStoredFile(storagePath: string): Promise<void> {
  try {
    const absolute = resolveStoragePath(storagePath)
    await unlink(absolute)
  } catch {
    // فایل غایب = هدف حذف محقق شده
  }
}

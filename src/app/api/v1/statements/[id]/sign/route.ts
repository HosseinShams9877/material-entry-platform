import { writeFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { signStatementSchema } from '@/lib/validate'
import { notifyUsers } from '@/lib/notify'
import { ensureUploadDir, resolveStoragePath, removeStoredFile } from '@/lib/upload'
import { logger, safeErrorMeta } from '@/lib/logger'
import sharp from 'sharp'

// ─────────────────────────── POST /api/v1/statements/[id]/sign — امضای مدیر کل ───────────────────────────
// صورت وضعیت‌های بالای آستانه (۱۵۰ میلیون تومان) پس از تأیید مدیر، با امضای دستی
// مدیر کل (رسم روی پد امضا → PNG) نهایی می‌شوند. فقط نقش GENERAL_MANAGER مجاز است.

const SIGNATURE_MAX_BYTES = 300 * 1024
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    if (user.role !== 'GENERAL_MANAGER') {
      throw new ApiError(403, 'FORBIDDEN', 'امضا فقط توسط مدیر کل انجام می‌شود.')
    }

    const statement = await db.progressStatement.findUnique({ where: { id: params.id } })
    if (!statement) throw new ApiError(404, 'NOT_FOUND', 'صورت وضعیت یافت نشد.')
    if (statement.status !== 'PENDING_GM_SIGN') {
      throw new ApiError(423, 'STATEMENT_NOT_SIGNABLE', 'این صورت وضعیت در انتظار امضا نیست.')
    }

    // استخراج بایت‌های PNG از dataURL — اعتبارسنجی چندلایه
    const base64 = body.signatureData.slice('data:image/png;base64,'.length)
    let bytes: Buffer
    try {
      bytes = Buffer.from(base64, 'base64')
    } catch {
      throw new ApiError(422, 'INVALID_SIGNATURE', 'تصویر امضا معتبر نیست.')
    }
    if (bytes.length === 0 || bytes.length > SIGNATURE_MAX_BYTES) {
      throw new ApiError(422, 'INVALID_SIGNATURE', 'حجم تصویر امضا مجاز نیست.')
    }
    const magicOk = PNG_MAGIC.every((b, i) => bytes[i] === b)
    if (!magicOk) {
      throw new ApiError(415, 'MIME_SPOOFED', 'قالب امضا باید PNG باشد.')
    }

    // بازپردازش با Sharp — اطمینان از تصویر واقعی + حذف متادیتا + یکسان‌سازی ابعاد
    let processed: Buffer
    try {
      processed = await sharp(bytes)
        .resize({ width: 640, height: 320, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer()
    } catch {
      throw new ApiError(422, 'INVALID_SIGNATURE', 'تصویر امضا قابل پردازش نیست.')
    }

    await ensureUploadDir()
    const storageName = `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}.png`
    const absolute = resolveStoragePath(storageName)
    await writeFile(absolute, processed)

    // در صورت شکست ثبت در DB — فایل حذف می‌شود (بدون فایل یتیم)
    try {
      const now = new Date()
      await db.progressStatement.update({
        where: { id: statement.id },
        data: {
          status: 'SIGNED',
          signedById: user.id,
          signedAt: now,
          signerName: user.fullName,
          signaturePath: storageName,
        },
      })

      await writeAudit({
        user,
        action: 'SIGN_STATEMENT',
        entityType: 'ProgressStatement',
        entityId: statement.id,
        oldValue: { status: statement.status },
        newValue: { status: 'SIGNED', signerName: user.fullName, signedAt: now.toISOString() },
        ip,
        userAgent,
      })

      // اعلان به ثبت‌کننده و تأییدکننده
      const watchers = [statement.createdById, statement.approvedById].filter(
        (id): id is string => !!id && id !== user.id
      )
      await notifyUsers({
        userIds: watchers,
        type: 'STATEMENT_SIGNED',
        title: 'صورت وضعیت با امضای مدیر کل نهایی شد',
        body: `صورت وضعیت شمارهٔ ${statement.number.toLocaleString('fa-IR')} («${statement.title}») توسط مدیر کل امضا و نهایی شد.`,
        entityId: statement.id,
        entityType: 'ProgressStatement',
      })

      return ok({ status: 'SIGNED', signedAt: now.toISOString() })
    } catch (err) {
      await removeStoredFile(storageName)
      logger.error('statement-sign', 'failed to persist signature', safeErrorMeta(err))
      throw new ApiError(500, 'SIGN_SAVE_FAILED', 'ذخیرهٔ امضا انجام نشد. دوباره تلاش کنید.')
    }
  },
  {
    permission: 'statement.gmSign',
    schema: signStatementSchema,
    rateLimit: { limit: 20, windowMs: 60_000, scope: 'statements-write' },
  }
)

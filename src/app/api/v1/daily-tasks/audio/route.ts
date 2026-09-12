import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { validateAudio, storeAudioFile } from '@/lib/audio-upload'
import { MAX_AUDIO_SIZE } from '@/lib/audio-upload'
import { UploadValidationError } from '@/lib/upload'
import { removeStoredFile, resolveStoragePath } from '@/lib/upload'
import { getSpeechToTextProvider, SttUnavailableError } from '@/lib/stt'
import { notifyUsers } from '@/lib/notify'
import { logger, safeErrorMeta } from '@/lib/logger'

// ─────────────────────────── POST /api/v1/daily-tasks/audio — بارگذاری صوت دستور وظیفه ───────────────────────────
// اعتبارسنجی چندلایه (Magic Bytes + MIME + پسوند + حجم) → ذخیره خارج از public با نام سرساخت →
// تبدیل به متن (قابل تعویض از ENV) → در شکست سرویس: فایل حفظ و وضعیت FAILED ثبت می‌شود.

export const POST = apiHandler(
  async ({ req, user, ip, userAgent }) => {
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ApiError(422, 'INVALID_AUDIO', 'فایل صوتی ارسال نشده است.')
    }

    // گارد زودهنگام حجم — قبل از Parse بدنه (بدنهٔ حجیم هرگز وارد حافظه نمی‌شود)
    const declaredLength = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_SIZE + 64 * 1024) {
      throw new ApiError(413, 'AUDIO_TOO_LARGE', 'حجم فایل صوتی بیش از حد مجاز است.')
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw new ApiError(413, 'AUDIO_TOO_LARGE', 'بدنهٔ درخواست بیش از حد مجاز است یا فرم نامعتبر است.')
    }
    const file = form.get('audio')
    if (!(file instanceof File)) throw new ApiError(422, 'INVALID_AUDIO', 'فایل صوتی ارسال نشده است.')

    // اعتبارسنجی چندلایه — هر رد شدن یعنی هیچ فایلی ذخیره نشده است
    let processed
    try {
      processed = await validateAudio(file)
    } catch (err) {
      if (err instanceof UploadValidationError) {
        throw new ApiError(err.status, err.code, err.faMessage)
      }
      throw new ApiError(422, 'INVALID_AUDIO', 'فایل صوتی قابل پذیرش نیست.')
    }

    const stored = await storeAudioFile(processed)

    // در صورت شکست ثبت در DB — فایل فیزیکی حذف می‌شود (بدون فایل یتیم)
    let audio: Awaited<ReturnType<typeof db.dailyAudio.create>>
    try {
      audio = await db.dailyAudio.create({
        data: {
          kind: 'TASK',
          fileName: stored.fileName,
          mimeType: stored.mime,
          size: stored.size,
          storagePath: stored.storagePath,
          uploadedById: user.id,
          transcribeStatus: 'NONE',
        },
      })
    } catch (err) {
      await removeStoredFile(stored.storagePath)
      logger.error('audio-upload', 'failed to create DailyAudio record', safeErrorMeta(err))
      throw new ApiError(500, 'AUDIO_SAVE_FAILED', 'ذخیرهٔ فایل صوتی انجام نشد. دوباره تلاش کنید.')
    }

    // ── تبدیل به متن — سرویس قابل تعویض از Environment ──
    const { provider, language } = getSpeechToTextProvider()
    if (!provider) {
      await db.dailyAudio.update({
        where: { id: audio.id },
        data: { transcribeStatus: 'FAILED', transcribeError: 'سرویس تبدیل گفتار به متن تنظیم نشده است (STT_PROVIDER=none).' },
      })
      await writeAudit({
        user,
        action: 'TRANSCRIPTION_FAILED',
        entityType: 'DailyAudio',
        entityId: audio.id,
        newValue: { reason: 'stt disabled' },
        ip,
        userAgent,
      })
      await notifyUsers({
        userIds: [user.id],
        type: 'TRANSCRIPTION_FAILED',
        title: 'تبدیل صوت به متن انجام نشد',
        body: 'سرویس تبدیل صوت در دسترس نیست؛ می‌توانید متن را دستی وارد کنید. فایل صوتی شما حفظ شده است.',
        entityId: audio.id,
        entityType: 'DailyAudio',
      })
      audio = await db.dailyAudio.findUniqueOrThrow({ where: { id: audio.id } })
      return ok({
        audioId: audio.id,
        fileName: audio.fileName,
        mimeType: audio.mimeType,
        size: audio.size,
        transcribeStatus: audio.transcribeStatus,
        transcribeError: audio.transcribeError,
        transcript: null,
      })
    }

    try {
      const absolute = resolveStoragePath(stored.storagePath)
      const result = await provider.transcribe(absolute, language)
      audio = await db.dailyAudio.update({
        where: { id: audio.id },
        data: { transcript: result.text.slice(0, 8000), transcribeStatus: 'DONE', transcribedAt: new Date(), transcribeError: null },
      })
      await writeAudit({
        user,
        action: 'TRANSCRIBE_AUDIO',
        entityType: 'DailyAudio',
        entityId: audio.id,
        newValue: { engine: provider.name, length: result.text.length },
        ip,
        userAgent,
      })
    } catch (err) {
      const reason = err instanceof SttUnavailableError ? err.reason : 'provider failure'
      logger.error('stt', 'transcription failed', safeErrorMeta(err))
      // فایل صوتی حفظ می‌شود؛ وضعیت FAILED + اعلان — مدیر می‌تواند متن را دستی وارد کند
      audio = await db.dailyAudio.update({
        where: { id: audio.id },
        data: { transcribeStatus: 'FAILED', transcribeError: 'تبدیل صوت به متن ناموفق بود.' },
      })
      await writeAudit({
        user,
        action: 'TRANSCRIPTION_FAILED',
        entityType: 'DailyAudio',
        entityId: audio.id,
        newValue: { reason },
        ip,
        userAgent,
      })
      await notifyUsers({
        userIds: [user.id],
        type: 'TRANSCRIPTION_FAILED',
        title: 'تبدیل صوت به متن انجام نشد',
        body: 'فایل صوتی شما حفظ شده است؛ می‌توانید متن دستور را دستی وارد کنید.',
        entityId: audio.id,
        entityType: 'DailyAudio',
      })
    }

    return ok({
      audioId: audio.id,
      fileName: audio.fileName,
      mimeType: audio.mimeType,
      size: audio.size,
      transcribeStatus: audio.transcribeStatus,
      transcribeError: audio.transcribeError,
      transcript: audio.transcript,
    })
  },
  { permission: 'voice.upload', rateLimit: { limit: 20, windowMs: 60_000, scope: 'daily-audio-upload' } }
)

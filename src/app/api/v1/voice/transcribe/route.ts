import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'

/**
 * مرحله ۱ Voice Pipeline: تبدیل صدا به متن (ASR)
 * صدا فقط به Transcript تبدیل می‌شود — هیچ داده‌ای ذخیره نهایی نمی‌شود.
 */
export const POST = apiHandler(
  async ({ req, user, ip, userAgent }) => {
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ApiError(422, 'INVALID_AUDIO', 'فایل صوتی ارسال نشده است.')
    }
    const form = await req.formData()
    const file = form.get('audio')
    if (!(file instanceof File)) throw new ApiError(422, 'INVALID_AUDIO', 'فایل صوتی ارسال نشده است.')
    if (file.size === 0) throw new ApiError(422, 'EMPTY_AUDIO', 'صدایی ضبط نشده است.')
    if (file.size > 15 * 1024 * 1024) throw new ApiError(413, 'AUDIO_TOO_LARGE', 'فایل صوتی بیش از حد بزرگ است.')

    const buffer = Buffer.from(await file.arrayBuffer())
    let transcript = ''
    try {
      const zai = await ZAI.create()
      const res = await zai.audio.asr.create({ file_base64: buffer.toString('base64') })
      transcript = (res.text ?? '').trim()
    } catch (err) {
      console.error('[voice/transcribe] ASR failed:', err)
      throw new ApiError(502, 'ASR_FAILED', 'صدای شما قابل تشخیص نبود. لطفاً واضح‌تر و در محیط کم‌سروصدا تلاش کنید.')
    }

    if (!transcript) {
      throw new ApiError(422, 'EMPTY_TRANSCRIPT', 'متنی از صدای شما شنیده نشد. دوباره تلاش کنید.')
    }

    // ثبت Transcript برای Audit — اما هیچ Entry ساخته نمی‌شود
    const vt = await db.voiceTranscript.create({
      data: { transcript, createdById: user.id, engine: 'z-ai' },
    })

    await writeAudit({ user, action: 'VOICE_PROCESS', entityType: 'VoiceTranscript', entityId: vt.id, newValue: { transcript: transcript.slice(0, 200) }, ip, userAgent })

    return ok({ transcriptId: vt.id, transcript })
  },
  { permission: 'entry.create', rateLimit: { limit: 20, windowMs: 60_000, scope: 'voice' } }
)

import { readFile } from 'node:fs/promises'
import {
  getSttProvider,
  STT_LANGUAGE,
  STT_API_URL,
  STT_API_KEY,
  type SttProvider,
} from '@/lib/env'

// ─────────────────────────── Speech-to-Text Abstraction ───────────────────────────
// سرویس تبدیل گفتار به متن قابل تعویض است:
// - z-ai:     سرویس داخلی ZAI ASR (پیش‌فرض)
// - external: هر HTTP سرویس سازگار با قرارداد زیر از طریق STT_API_URL/STT_API_KEY
// - none:     بدون سرویس — فایل حفظ و وضعیت FAILED ثبت می‌شود؛ متن دستی وارد می‌گردد
// کلید API فقط از Environment خوانده می‌شود و هرگز به کلاینت نمی‌رسد.

export interface SpeechToTextResult {
  text: string
  confidence?: number
}

export interface SpeechToTextProvider {
  readonly name: string
  transcribe(filePath: string, language: string): Promise<SpeechToTextResult>
}

class SttUnavailableError extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

export { SttUnavailableError }

/** ارائه‌دهندهٔ داخلی ZAI — همان موتور Voice Pipeline ثبت ورود مصالح */
class ZaiSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = 'z-ai'
  async transcribe(filePath: string, _language: string): Promise<SpeechToTextResult> {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const buffer = await readFile(filePath)
    const zai = await ZAI.create()
    const res = await zai.audio.asr.create({ file_base64: buffer.toString('base64') })
    const text = (res.text ?? '').trim()
    if (!text) throw new SttUnavailableError('empty transcript from z-ai')
    return { text }
  }
}

/**
 * ارائه‌دهندهٔ خارجی — قرارداد:
 * POST STT_API_URL  { audioBase64, language }  با هدر Authorization: Bearer STT_API_KEY
 * پاسخ مورد انتظار: { text, confidence? }
 */
class ExternalSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = 'external'
  async transcribe(filePath: string, language: string): Promise<SpeechToTextResult> {
    if (!STT_API_URL) throw new SttUnavailableError('STT_API_URL is not configured')
    const buffer = await readFile(filePath)
    const res = await fetch(STT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(STT_API_KEY ? { Authorization: `Bearer ${STT_API_KEY}` } : {}),
      },
      body: JSON.stringify({ audioBase64: buffer.toString('base64'), language }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      throw new SttUnavailableError(`external STT responded ${res.status}`)
    }
    const data = (await res.json().catch(() => null)) as { text?: string; confidence?: number } | null
    const text = (data?.text ?? '').trim()
    if (!text) throw new SttUnavailableError('external STT returned empty transcript')
    return { text, confidence: typeof data?.confidence === 'number' ? data.confidence : undefined }
  }
}

/** دریافت ارائه‌دهندهٔ فعال از Environment؛ در حالت none با SttUnavailableError شکست می‌خورد */
export function getSpeechToTextProvider(): { provider: SpeechToTextProvider | null; providerKind: SttProvider; language: string } {
  const providerKind = getSttProvider()
  const language = STT_LANGUAGE
  let provider: SpeechToTextProvider | null = null
  if (providerKind === 'z-ai') provider = new ZaiSpeechToTextProvider()
  else if (providerKind === 'external') provider = new ExternalSpeechToTextProvider()
  return { provider, providerKind, language }
}

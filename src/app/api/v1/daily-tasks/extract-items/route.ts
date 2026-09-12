import ZAI from 'z-ai-web-dev-sdk'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { extractItemsSchema } from '@/lib/validate'
import { logger, safeErrorMeta } from '@/lib/logger'

// ─────────────────────────── POST /api/v1/daily-tasks/extract-items ───────────────────────────
// تبدیل متن دستور صوتی/دستی به آیتم‌های اجرایی با LLM.
// خروجی فقط «پیشنهاد» است — مدیر پیش از ارسال آن‌ها را ویرایش/تأیید می‌کند
// (بدون تأیید مدیر، وظیفهٔ صوتی هرگز مستقیماً ارسال نمی‌شود).

interface AiItems {
  items: Array<{ title: string; description?: string | null }>
  confidence?: number
}

const SYSTEM_PROMPT = `تو دستیار مدیر کارگاه‌های ساختمانی هستی.
مدیر یک دستور کاری به زبان فارسی می‌دهد (متن یا رو‌نویس صوت). تو آن را به فهرست آیتم‌های اجرایی کوتاه و قابل تیک‌زدن تبدیل می‌کنی — فقط JSON خروجی بده، بدون توضیح اضافه.

قوانین:
1. هر آیتم یک اقدام مشخص و عملیاتی باشد (عنوان کوتاه، حداکثر ۱۲ کلمه، بدون فعل پایانی مجزا).
2. اگر جزئیات تکمیلی در متن هست، در description بیاور (می‌تواند خالی باشد).
3. ترتیب آیتم‌ها همان ترتیب اجرا در متن باشد.
4. چیزی که در متن نیامده اضافه نکن. هیچ چیز را حدس نزن.
5. اگر متن فقط یک کار واحد است، همان یک آیتم را برگردان.

خروجی فقط این JSON باشد:
{"items":[{"title":"...","description":null}],"confidence":0.85}`

function parseJsonLoose(text: string): AiItems | null {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

export const POST = apiHandler(
  async ({ body }) => {
    let parsed: AiItems | null = null
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: SYSTEM_PROMPT },
          { role: 'user', content: `دستور مدیر کارگاه:\n«${body.transcript}»` },
        ],
        thinking: { type: 'disabled' },
      })
      const raw = completion.choices[0]?.message?.content ?? ''
      parsed = parseJsonLoose(raw)
    } catch (err) {
      logger.error('daily-extract', 'item extraction failed', safeErrorMeta(err))
      throw new ApiError(502, 'EXTRACT_FAILED', 'تبدیل متن به آیتم‌های اجرایی انجام نشد. می‌توانید آیتم‌ها را دستی وارد کنید.')
    }

    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      throw new ApiError(502, 'EXTRACT_FAILED', 'متنی قابل تبدیل به آیتم اجرایی پیدا نشد. آیتم‌ها را دستی وارد کنید.')
    }

    const items = parsed.items
      .filter((it) => typeof it?.title === 'string' && it.title.trim().length >= 2)
      .slice(0, 30)
      .map((it, idx) => ({
        title: it.title.trim().slice(0, 200),
        description: typeof it.description === 'string' && it.description.trim() ? it.description.trim().slice(0, 500) : null,
        sortOrder: idx,
      }))

    if (items.length === 0) {
      throw new ApiError(502, 'EXTRACT_FAILED', 'متنی قابل تبدیل به آیتم اجرایی پیدا نشد. آیتم‌ها را دستی وارد کنید.')
    }

    return ok({
      items,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : undefined,
    })
  },
  {
    permission: 'task.create',
    schema: extractItemsSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-extract' },
  }
)

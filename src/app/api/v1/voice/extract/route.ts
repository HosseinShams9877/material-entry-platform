import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { getUserScope } from '@/lib/scope'
import { z } from 'zod'

const extractSchema = z.object({
  transcript: z.string().trim().min(3, 'متن گفتار خالی است.').max(4000),
  transcriptId: z.string().trim().optional().nullable(),
})

// خروجی ساختاریافته‌ای که AI مجاز است تولید کند — هرگز مستقیم در DB ذخیره نمی‌شود
interface AiDraft {
  type: string | null
  sourceType: string | null
  sourceName: string | null
  projectNames: string[]
  items: Array<{ materialName: string; quantity: number | null; unit: string | null; brand: string | null }>
  workers: Array<{ name: string; role: string | null }>
  hasInvoice: boolean | null
  confidence: number
  notes: string | null
}

const SYSTEM_PROMPT = `تو دستیار هوشمند ثبت ورود مصالح کارگاه‌های ساختمانی هستی.
کاربر متن گفتار طبیعی فارسی درباره ورود مصالح را می‌دهد. تو فقط یک JSON ساختاریافته تولید می‌کنی — هیچ توضیح اضافه‌ای ننویس.

قوانین سخت‌گیرانه:
1. فقط اطلاعاتی که صریحاً در متن آمده را استخراج کن. هرگز حدس نزن.
2. type یکی از: PURCHASE (خرید/شرکت/تأمین‌کننده آورد)، TRANSFER (انتقال از کارگاه دیگر)، LOAN (امانت گرفتن)، RETURN (برگشت)، OTHER
3. sourceType یکی از: SUPPLIER (شرکت/فروشنده)، WORKSHOP (کارگاه)، OTHER
4. sourceName: نام تأمین‌کننده یا کارگاه مبدأ — دقیقاً همان‌طور که گفته شده
5. projectNames: آرایه نام پروژه‌های ذکرشده (ممکن است چند تا باشد)
6. items: اقلام مصالح. quantity را به عدد تبدیل کن («پنجاه» → 50، «دو و نیم» → 2.5، «صد» → 100، «دو هزار» → 2000). unit: کیسه/تن/عدد/متر/مترمربع/مترمکعب/لیتر/بسته/پالت/ماشین/شاخه/رول/دستگاه
7. workers: نام افرادی که ذکر شده (تخلیه کرده/راننده/...)
8. hasInvoice: true اگر فاکتور/رسید/بارنامه ذکر شده
9. confidence: عدد 0 تا 1 — میزان اطمینان کل استخراج
10. اگر اطلاعاتی در متن نباشد، مقدار null بگذار (آرایه‌ها خالی)
11. اعداد فارسی و حروف فارسی را به عدد لاتین تبدیل کن

خروجی فقط این JSON باشد:
{"type":null,"sourceType":null,"sourceName":null,"projectNames":[],"items":[{"materialName":"","quantity":null,"unit":null,"brand":null}],"workers":[{"name":"","role":null}],"hasInvoice":null,"confidence":0.8,"notes":null}`

function parseJsonLoose(text: string): AiDraft | null {
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

/** فازی: تطبیق نام ذکرشده با داده‌های واقعی کارگاه */
function bestMatch<T>(query: string, candidates: T[], getName: (c: T) => string): { item: T; score: number } | null {
  if (!query || candidates.length === 0) return null
  const q = query.replace(/\s+/g, ' ').trim()
  let best: { item: T; score: number } | null = null
  for (const c of candidates) {
    const name = getName(c).replace(/\s+/g, ' ').trim()
    let score = 0
    if (name === q) score = 1
    else if (name.includes(q) || q.includes(name)) score = 0.85
    else {
      const tokens = q.split(' ')
      const matched = tokens.filter((t) => t.length > 1 && name.includes(t)).length
      if (matched > 0) score = Math.min(0.7, (matched / tokens.length) * 0.7)
    }
    if (!best || score > best.score) best = { item: c, score }
  }
  return best && best.score >= 0.5 ? best : null
}

/**
 * مرحله ۲ Voice Pipeline: استخراج ساختاریافته با LLM + تطبیق با Master Data واقعی
 * خروجی فقط یک Draft پیشنهادی است — Preview و تأیید انسانی الزامی است.
 */
export const POST = apiHandler(
  async ({ body, user }) => {
    const { transcript, transcriptId } = body

    // Master Data واقعی کاربر (Scope-aware) برای تطبیق نام‌ها
    const scope = await getUserScope(user)
    const mdFilter = scope.isGlobal ? {} : { workshopId: { in: scope.workshopIds.length ? scope.workshopIds : ['__none__'] } }
    const [materials, suppliers, projects, workers] = await Promise.all([
      db.material.findMany({ where: { isActive: true, ...mdFilter } }),
      db.supplier.findMany({ where: { isActive: true, ...mdFilter } }),
      db.project.findMany({
        where: { isActive: true, ...(scope.isGlobal ? {} : scope.projectIds ? { id: { in: scope.projectIds } } : { workshopId: { in: scope.workshopIds.length ? scope.workshopIds : ['__none__'] } }) },
      }),
      db.worker.findMany({ where: { isActive: true, ...mdFilter } }),
    ])

    // LLM Extraction
    let draft: AiDraft | null = null
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `متن گفتار کاربر:\n«${transcript}»\n\nنام‌های واقعی ثبت‌شده در سیستم (برای تطبیق بهتر، ولی فقط اگر در متن کاربر آمده):\nپروژه‌ها: ${projects.map((p) => p.name).join('، ')}\nتأمین‌کنندگان: ${suppliers.map((s) => s.name).join('، ')}\nمصالح: ${materials.map((m) => m.name).join('، ')}`,
          },
        ],
        thinking: { type: 'disabled' },
      })
      const raw = completion.choices[0]?.message?.content ?? ''
      draft = parseJsonLoose(raw)
    } catch (err) {
      console.error('[voice/extract] LLM failed:', err)
      throw new ApiError(502, 'EXTRACT_FAILED', 'پردازش هوشمند متن انجام نشد. می‌توانید اطلاعات را دستی وارد کنید.')
    }

    if (!draft) {
      throw new ApiError(502, 'EXTRACT_FAILED', 'متن شما قابل تفسیر نبود. لطفاً جمله را ساده‌تر بگویید یا دستی ثبت کنید.')
    }

    // ── تطبیق با داده‌های واقعی + تشخیص ابهام و اطلاعات گمشده ──
    const missing: string[] = []
    const ambiguities: string[] = []

    // نوع ورود
    const type = draft.type && ['PURCHASE', 'TRANSFER', 'LOAN', 'RETURN', 'OTHER'].includes(draft.type) ? draft.type : null
    if (!type) missing.push('type')

    // مبدأ
    let sourceType: string | null = draft.sourceType && ['SUPPLIER', 'WORKSHOP', 'OTHER'].includes(draft.sourceType) ? draft.sourceType : null
    let sourceSupplierId: string | null = null
    let sourceWorkshopId: string | null = null
    let sourceLabel: string | null = draft.sourceName ?? null

    if (draft.sourceName) {
      const supplierMatch = bestMatch(draft.sourceName, suppliers, (s) => s.name)
      const workshopMatch = bestMatch(draft.sourceName, await db.workshop.findMany({ where: { isActive: true } }), (w) => w.name)
      if (supplierMatch && (!workshopMatch || supplierMatch.score >= workshopMatch.score)) {
        sourceType = 'SUPPLIER'
        sourceSupplierId = supplierMatch.item.id
        sourceLabel = supplierMatch.item.name
        if (supplierMatch.score < 1) ambiguities.push(`مبدأ «${draft.sourceName}» با «${supplierMatch.item.name}» تطبیق داده شد.`)
      } else if (workshopMatch) {
        sourceType = 'WORKSHOP'
        sourceWorkshopId = workshopMatch.item.id
        sourceLabel = workshopMatch.item.name
        if (workshopMatch.score < 1) ambiguities.push(`مبدأ «${draft.sourceName}» با «${workshopMatch.item.name}» تطبیق داده شد.`)
      } else {
        sourceType = sourceType ?? 'SUPPLIER'
        ambiguities.push(`مبدأ «${draft.sourceName}» در فهرست تأمین‌کنندگان پیدا نشد؛ به‌صورت دستی بررسی کنید.`)
      }
    } else {
      missing.push('source')
    }

    // پروژه‌ها
    const matchedProjects = (draft.projectNames ?? [])
      .map((pn) => bestMatch(pn, projects, (p) => p.name))
      .filter((m): m is { item: (typeof projects)[0]; score: number } => m !== null)
      .map((m) => ({ id: m.item.id, name: m.item.name, score: m.score }))
    if (matchedProjects.length === 0) missing.push('project')

    // اقلام
    const items = (draft.items ?? [])
      .filter((it) => it.materialName && it.materialName.trim())
      .map((it) => {
        const m = bestMatch(it.materialName, materials, (mm) => mm.name)
        return {
          materialId: m?.item.id ?? null,
          materialName: m && m.score >= 0.85 ? m.item.name : it.materialName,
          matchedName: m && m.score >= 0.85 ? m.item.name : null,
          quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : null,
          unit: it.unit ?? m?.item.defaultUnit ?? null,
          brand: it.brand ?? null,
        }
      })
    if (items.length === 0) missing.push('items')
    if (items.some((it) => it.quantity === null)) missing.push('quantity')
    if (items.some((it) => !it.unit)) missing.push('unit')

    // افراد
    const matchedWorkers = (draft.workers ?? [])
      .filter((w) => w.name && w.name.trim())
      .map((w) => {
        const m = bestMatch(w.name, workers, (ww) => ww.fullName)
        return {
          workerId: m?.item.id ?? null,
          workerName: m?.item.fullName ?? w.name.trim(),
          workerKind: m?.item.kind ?? 'LABORER',
          role: w.role ?? null,
        }
      })

    const confidence = typeof draft.confidence === 'number' ? Math.max(0, Math.min(1, draft.confidence)) : 0.5

    // به‌روزرسانی Transcript با خروجی استخراج (Audit)
    if (transcriptId) {
      await db.voiceTranscript
        .updateMany({ where: { id: transcriptId, createdById: user.id }, data: { extractedJson: JSON.stringify(draft), confidence, missingFields: JSON.stringify(missing) } })
        .catch(() => undefined)
    }

    return ok({
      draft: {
        type,
        sourceType,
        sourceSupplierId,
        sourceWorkshopId,
        sourceLabel,
        projects: matchedProjects,
        items,
        workers: matchedWorkers,
        hasInvoice: draft.hasInvoice ?? false,
        notes: draft.notes ?? null,
        transcriptId: transcriptId ?? null,
        transcript,
        confidence,
        missing,
        ambiguities,
      },
    })
  },
  { permission: 'entry.create', schema: extractSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'voice-extract' } }
)

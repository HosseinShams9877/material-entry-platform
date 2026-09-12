"use client"

import { AlertTriangle, Sparkles, Mic } from 'lucide-react'
import { EntryDraftForm, emptyDraft, type DraftFormValue } from '@/components/app/entry-draft-form'
import type { VoiceDraft } from '@/lib/client'
import { MISSING_FIELD_MSG } from '@/components/app/messages'
import { toFa } from '@/lib/fa'

/** تبدیل Draft هوشمند AI به فرم قابل ویرایش — تأیید انسانی قبل از هر ذخیره‌سازی */
export default function VoicePreview({ params }: { params?: Record<string, unknown> }) {
  const draft = params?.draft as VoiceDraft | undefined

  if (!draft) {
    return (
      <div className="max-w-lg mx-auto min-h-dvh flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">داده‌ای برای نمایش نیست. دوباره تلاش کنید.</p>
      </div>
    )
  }

  const highlight = new Set<string>(draft.missing)
  const lowConfidence = draft.confidence < 0.6

  const initial: DraftFormValue = {
    ...emptyDraft(),
    type: (draft.type as DraftFormValue['type']) ?? 'PURCHASE',
    sourceType: (draft.sourceType as DraftFormValue['sourceType']) ?? 'SUPPLIER',
    sourceSupplierId: draft.sourceSupplierId,
    sourceWorkshopId: draft.sourceWorkshopId,
    sourceLabel: draft.sourceLabel,
    projectIds: draft.projects.map((p) => p.id),
    items: draft.items.length
      ? draft.items.map((it) => ({
          materialId: it.materialId,
          materialName: it.materialName,
          quantity: it.quantity !== null ? String(it.quantity) : '',
          unit: it.unit ?? '',
          brand: it.brand ?? '',
        }))
      : [{ materialId: null, materialName: '', quantity: '', unit: '', brand: '' }],
    workers: draft.workers.map((w) => ({ workerId: w.workerId, workerName: w.workerName, workerKind: w.workerKind })),
    hasInvoice: draft.hasInvoice,
    notes: draft.notes ?? '',
    highlight,
  }

  const confidenceStyle =
    draft.confidence >= 0.8 ? 'bg-green-50 border-green-200 text-green-800' : lowConfidence ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-yellow-50 border-yellow-300 text-yellow-800'

  return (
    <EntryDraftForm
      initial={initial}
      title="بررسی اطلاعات استخراج‌شده"
      subtitle="همه فیلدها قابل ویرایش هستند"
      banner={
        <div className="px-4 pt-4 space-y-2.5">
          {/* متن گفتار */}
          <div className="rounded-2xl bg-zinc-900 text-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <Mic className="size-4 text-amber-400" />
              <span className="text-xs text-zinc-400">متن گفتار شما:</span>
            </div>
            <p className="text-sm leading-7">{draft.transcript}</p>
          </div>

          {/* اطمینان */}
          <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${confidenceStyle}`}>
            <Sparkles className="size-4 mt-0.5 shrink-0" />
            <div className="text-xs leading-6">
              <span className="font-semibold">اطمینان هوش مصنوعی: {toFa(Math.round(draft.confidence * 100))}٪</span>
              {lowConfidence ? ' — لطفاً همه اطلاعات را با دقت بررسی کنید.' : ' — اطلاعات زیر را تأیید یا اصلاح کنید.'}
            </div>
          </div>

          {/* ابهام‌ها */}
          {draft.ambiguities.map((a) => (
            <div key={a} className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-800 leading-6">{a}</p>
            </div>
          ))}

          {/* اطلاعات گمشده — Progressive Clarification */}
          {draft.missing.length > 0 ? (
            <div className="rounded-xl border border-orange-300 bg-orange-50 p-3.5">
              <p className="text-xs font-bold text-orange-700 mb-1.5">این اطلاعات در گفتار شما نبود:</p>
              <ul className="space-y-1">
                {draft.missing.map((m) => (
                  <li key={m} className="text-xs text-orange-700 leading-6">
                    • {MISSING_FIELD_MSG[m] ?? 'این مورد را تکمیل کنید.'}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      }
    />
  )
}

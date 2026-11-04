"use client"

import { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, FileText, ExternalLink } from 'lucide-react'
import { toFa } from '@/lib/fa'

// ───────────────────────── نمایشگر تصاویر مشترک (Lightbox) ─────────────────────────
// هر صفحه‌ای که تصویر/مدرک پیوست دارد با همین کامپوننت نمایش می‌دهد:
//   • عکس‌ها به‌صورت تمام‌صفحه با امکان رفتن به تصویر قبلی/بعدی
//   • فایل‌های PDF در داخل لایت‌باکس باز نمی‌شوند — کارت «باز کردن در تب جدید»
//   • بستن: ضربه روی پس‌زمینه، دکمه × یا کلید Escape
// دسترسی به خود فایل‌ها از قبل توسط APIهای مربوطه کنترل می‌شود (Scope/IDOR).

export interface ViewerItem {
  id: string
  url: string
  fileName?: string | null
  mimeType?: string | null
}

export function ImageViewer({
  items,
  index,
  onClose,
}: {
  items: ViewerItem[]
  index: number
  onClose: () => void
}) {
  const [current, setCurrent] = useState(Math.min(Math.max(index, 0), Math.max(items.length - 1, 0)))

  const go = useCallback(
    (delta: number) => {
      setCurrent((c) => {
        const next = c + delta
        if (next < 0) return items.length - 1
        if (next > items.length - 1) return 0
        return next
      })
    },
    [items.length]
  )

  // بستن با کلید Escape + ناوبری با کلیدهای جهت‌نما
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(1) // RTL: کلید چپ = تصویر بعدی
      else if (e.key === 'ArrowRight') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (items.length === 0) return null
  const item = items[current]
  const isPdf = (item.mimeType ?? '').includes('pdf') || (item.fileName ?? '').toLowerCase().endsWith('.pdf')
  const multiple = items.length > 1

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
      role="dialog"
      aria-label="نمایش پیوست"
      onClick={onClose}
    >
      {/* هدر: نام فایل + دکمهٔ بستن */}
      <div
        className="absolute top-4 inset-x-4 flex items-center justify-between gap-3 max-w-3xl mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-zinc-200 truncate flex-1 text-center">{item.fileName ?? 'پیوست'}</p>
        <button
          type="button"
          onClick={onClose}
          className="size-9 rounded-lg flex items-center justify-center text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700 shrink-0"
          aria-label="بستن"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* بدنه: عکس یا کارت PDF */}
      {isPdf ? (
        <div
          className="rounded-2xl bg-zinc-900 border border-zinc-700 p-8 flex flex-col items-center gap-4 max-w-[94vw]"
          onClick={(e) => e.stopPropagation()}
        >
          <FileText className="size-14 text-red-400" />
          <p className="text-sm text-zinc-200 text-center break-all">{item.fileName ?? 'فایل PDF'}</p>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white"
          >
            <ExternalLink className="size-4" />
            باز کردن در تب جدید
          </a>
        </div>
      ) : (
        <img
          src={item.url}
          alt={item.fileName ?? 'پیوست تصویری'}
          className="max-h-[78vh] max-w-[94vw] rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* ناوبری چندتصویری */}
      {multiple ? (
        <div
          className="absolute bottom-6 inset-x-4 flex items-center justify-center gap-6"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => go(-1)}
            className="size-11 rounded-full flex items-center justify-center text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700"
            aria-label="تصویر قبلی"
          >
            <ChevronRight className="size-6" />
          </button>
          <p className="text-xs text-zinc-200 tabular-nums min-w-16 text-center">
            {toFa(current + 1)} از {toFa(items.length)}
          </p>
          <button
            type="button"
            onClick={() => go(1)}
            className="size-11 rounded-full flex items-center justify-center text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700"
            aria-label="تصویر بعدی"
          >
            <ChevronLeft className="size-6" />
          </button>
        </div>
      ) : (
        <p className="absolute bottom-6 text-xs text-zinc-300">برای بستن ضربه بزنید</p>
      )}
    </div>
  )
}

/** هوک کمکی: مدیریت حالت باز/بستهٔ نمایشگر — بدون کد تکراری در هر صفحه */
export function useImageViewer() {
  const [state, setState] = useState<{ items: ViewerItem[]; index: number } | null>(null)

  const open = useCallback((items: ViewerItem[], index = 0) => {
    if (items.length === 0) return
    setState({ items, index })
  }, [])
  const close = useCallback(() => setState(null), [])

  const viewer = state ? <ImageViewer items={state.items} index={state.index} onClose={close} /> : null
  return { open, close, viewer }
}

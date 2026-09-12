"use client"

import { Mic, PenLine, ArrowLeftRight, HandCoins, Undo2, PackagePlus } from 'lucide-react'
import { useApp } from '@/store/app'
import { ScreenHeader } from '@/components/app/shared'
import { ENTRY_TYPES } from '@/lib/permissions'

const TYPE_ICONS = {
  PURCHASE: PackagePlus,
  TRANSFER: ArrowLeftRight,
  LOAN: HandCoins,
  RETURN: Undo2,
  OTHER: PackagePlus,
} as const

/** صفحه انتخاب نوع ورود — گام اول ثبت دستی و پیش‌فرض صوتی */
export default function EntryTypeSelect() {
  const navigate = useApp((s) => s.navigate)
  const back = useApp((s) => s.back)

  return (
    <div className="max-w-lg mx-auto min-h-dvh flex flex-col">
      <ScreenHeader title="نوع ورود را انتخاب کنید" subtitle="سپس فرم متناسب نمایش داده می‌شود" onBack={back} />
      <div className="p-4 space-y-2.5">
        {Object.entries(ENTRY_TYPES).map(([key, label]) => {
          const Icon = TYPE_ICONS[key as keyof typeof TYPE_ICONS]
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate('manual-entry', { type: key })}
              className="w-full rounded-2xl border border-border bg-card p-4 flex items-center gap-4 text-right min-h-16 active:scale-[0.99] transition-transform"
            >
              <span className="size-11 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Icon className="size-5 text-accent" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{label}</span>
              </span>
              <PenLine className="size-4 text-muted-foreground" />
            </button>
          )
        })}
      </div>
      <div className="p-4 mt-auto">
        <button
          type="button"
          onClick={() => navigate('voice-entry')}
          className="w-full rounded-2xl bg-zinc-900 text-white p-4 flex items-center justify-center gap-3 min-h-16 active:scale-[0.99] transition-transform"
        >
          <Mic className="size-5 text-amber-400" />
          <span className="text-sm font-medium">یا با صدا ثبت کنید — همه اطلاعات را بگویید</span>
        </button>
      </div>
    </div>
  )
}

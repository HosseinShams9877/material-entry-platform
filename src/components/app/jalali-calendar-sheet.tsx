"use client"

/**
 * تقویم شمسی (جلالی) به‌صورت پاپ‌آپ — Bottom Sheet
 * چیدمان کاملاً راست‌به‌چپ: شنبه اول هفته، راست = ماه قبل، ارقام فارسی
 * الگوی رندر: محتوای داخلی فقط هنگام باز بودن mount می‌شود (مثل SelectionSheet)
 */

import { useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react'
import {
  isoToJalali,
  jalaliToISO,
  jalaliMonthLabel,
  jalaliMonthLength,
  jalaliMonthFirstWeekday,
  JALALI_WEEKDAY_SHORT,
  formatJalaliFromISO,
  todayISO,
  addDaysISO,
  toFa,
} from '@/lib/fa'
import { cn } from '@/lib/utils'

export function JalaliCalendarSheet({
  open,
  onOpenChange,
  value,
  onSelect,
  title = 'انتخاب تاریخ',
  disableFuture = true,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** مقدار فعلی به‌صورت ISO (YYYY-MM-DD) یا null */
  value: string | null
  onSelect: (iso: string) => void
  title?: string
  /** جلوگیری از انتخاب تاریخ آینده (پیش‌فرض: تاریخ ورود در آینده معنا ندارد) */
  disableFuture?: boolean
}) {
  if (!open) return null
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none max-h-[88dvh] flex flex-col">
          <CalendarSheetInner
            value={value}
            onSelect={onSelect}
            onOpenChange={onOpenChange}
            title={title}
            disableFuture={disableFuture}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function CalendarSheetInner({
  value,
  onSelect,
  onOpenChange,
  title,
  disableFuture,
}: {
  value: string | null
  onSelect: (iso: string) => void
  onOpenChange: (v: boolean) => void
  title: string
  disableFuture: boolean
}) {
  const today = todayISO()
  // ماه اولیه: ماهِ مقدار انتخابی یا ماه امروز — mount در هر بازشدن تازه است
  const todayParts = isoToJalali(today)
  if (!todayParts) throw new Error('invalid today') // practically unreachable - type safety
  const base = isoToJalali(value || today) ?? todayParts
  const [view, setView] = useState({ jy: base[0], jm: base[1] })

  const cells = useMemo(() => {
    const len = jalaliMonthLength(view.jy, view.jm)
    const lead = jalaliMonthFirstWeekday(view.jy, view.jm)
    const list: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= len; d++) list.push(jalaliToISO(view.jy, view.jm, d))
    return list
  }, [view])

  function pick(iso: string) {
    onSelect(iso)
    onOpenChange(false)
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      let jm = v.jm + delta
      let jy = v.jy
      if (jm > 12) { jm = 1; jy++ }
      if (jm < 1) { jm = 12; jy-- }
      return { jy, jm }
    })
  }

  return (
    <>
      <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
      <Drawer.Title className="sr-only">{title}</Drawer.Title>

      <div className="px-5 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center size-8 rounded-lg bg-accent/10 text-accent">
            <CalendarDays className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-5">{title}</p>
            <p className="text-[11px] text-muted-foreground">تقویم شمسی</p>
          </div>
        </div>
        {/* ناوبری ماه — راست = ماه قبل (جریان زمان راست‌به‌چپ) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="size-10 rounded-lg hover:bg-secondary flex items-center justify-center"
            aria-label="ماه قبل"
          >
            <ChevronRight className="size-5" />
          </button>
          <span className="text-sm font-bold min-w-24 text-center">
            {jalaliMonthLabel(view.jy, view.jm)}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="size-10 rounded-lg hover:bg-secondary flex items-center justify-center"
            aria-label="ماه بعد"
          >
            <ChevronLeft className="size-5" />
          </button>
        </div>
      </div>

      {/* انتخاب سریع */}
      <div className="px-5 pb-2 flex gap-2">
        <button
          type="button"
          onClick={() => pick(today)}
          className="rounded-full border border-accent/40 bg-accent/10 text-accent px-3.5 py-1.5 text-xs font-medium min-h-8"
        >
          امروز
        </button>
        <button
          type="button"
          onClick={() => pick(addDaysISO(today, -1))}
          className="rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-xs font-medium min-h-8"
        >
          دیروز
        </button>
      </div>

      {/* سربرگ روزهای هفته */}
      <div className="grid grid-cols-7 px-4 pt-1 pb-1">
        {JALALI_WEEKDAY_SHORT.map((w) => (
          <span key={w} className="text-center text-[11px] font-medium text-muted-foreground py-1.5">
            {w}
          </span>
        ))}
      </div>

      {/* شبکهٔ روزها */}
      <div className="grid grid-cols-7 px-4 pb-2 gap-y-1" role="grid" aria-label="تقویم شمسی">
        {cells.map((iso, i) => {
          if (iso === null) return <span key={`b${i}`} />
          const parts = isoToJalali(iso)
          if (!parts) return <span key={`i${i}`} />
          const jd = parts[2]
          const isSel = value === iso
          const isToday = iso === today
          const disabled = disableFuture && iso > today
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => pick(iso)}
              className={cn(
                'mx-auto flex items-center justify-center size-10 rounded-xl text-sm font-medium transition-colors',
                disabled && 'text-muted-foreground/35 cursor-not-allowed',
                !disabled && !isSel && 'hover:bg-secondary',
                isToday && !isSel && 'border-2 border-accent/50 text-accent',
                isSel && 'bg-accent text-accent-foreground font-bold shadow-sm'
              )}
              aria-label={`${toFa(jd)} ${jalaliMonthLabel(view.jy, view.jm)}`}
              aria-pressed={isSel}
            >
              {toFa(jd)}
            </button>
          )
        })}
      </div>

      <div className="safe-top px-5 pb-3 pt-1 border-t border-border flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {value ? `انتخاب شده: ${formatJalaliFromISO(value)}` : 'روی یک روز بزنید'}
        </p>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="text-sm font-medium text-accent px-3 py-2 rounded-lg hover:bg-accent/10"
        >
          بستن
        </button>
      </div>
    </>
  )
}

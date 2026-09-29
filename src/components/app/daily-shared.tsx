"use client"

// ─────────────────────────── کامپوننت‌های مشترک ماژول وظایف روزانه ───────────────────────────

import { toFa } from '@/lib/fa'
import { cn } from '@/lib/utils'

// ─────────────────────────── نوار پیشرفت وظیفه ───────────────────────────

export function TaskProgress({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn('h-full rounded-full transition-all', value === 100 ? 'bg-green-600' : 'bg-amber-500')}
          style={{ width: `${value}%` }}
        />
      </div>
      {showLabel ? <span className="text-[11px] text-muted-foreground shrink-0">{toFa(value)}٪</span> : null}
    </div>
  )
}

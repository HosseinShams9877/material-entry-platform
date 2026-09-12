"use client"

import { useMemo, useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { ChevronRight, Search, Check, Inbox, WifiOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STATUS_STYLES, ENTRY_TYPES, TASK_STATUS_STYLES, TASK_PRIORITIES, TASK_PRIORITY_STYLES, REPORT_STATUS_STYLES, type TaskStatusKey, type TaskPriorityKey, type ReportStatusKey } from '@/lib/permissions'
import { toFa } from '@/lib/fa'
import { useApp } from '@/store/app'
import { cn } from '@/lib/utils'

// ─────────────────────────── Status Badge ───────────────────────────

export function StatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        style.badge
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  )
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
      {ENTRY_TYPES[type as keyof typeof ENTRY_TYPES] ?? type}
    </span>
  )
}

// ─────────────────────────── بج‌های ماژول وظایف روزانه ───────────────────────────

export function TaskStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const style = TASK_STATUS_STYLES[status as TaskStatusKey] ?? TASK_STATUS_STYLES.DRAFT
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        style.badge
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const label = TASK_PRIORITIES[priority as TaskPriorityKey] ?? priority
  const style = TASK_PRIORITY_STYLES[priority as TaskPriorityKey] ?? TASK_PRIORITY_STYLES.MEDIUM
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', style)}>
      اولویت {label}
    </span>
  )
}

export function ReportStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const style = REPORT_STATUS_STYLES[status as ReportStatusKey] ?? REPORT_STATUS_STYLES.DRAFT
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        style.badge
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  )
}

// ─────────────────────────── Header صفحه ───────────────────────────

export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  onBack?: () => void
}) {
  return (
    <header className="safe-top sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex items-center gap-2 px-3 h-14">
        {onBack ? (
          <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={onBack} aria-label="بازگشت">
            <ChevronRight className="size-6" />
          </Button>
        ) : null}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{title}</h1>
          {subtitle ? <p className="text-xs text-muted-foreground truncate">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  )
}

// ─────────────────────────── حالت‌های Empty / Loading / Error ───────────────────────────

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="size-14 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground mb-4">
        {icon ?? <Inbox className="size-7" />}
      </div>
      <p className="font-medium">{title}</p>
      {hint ? <p className="text-sm text-muted-foreground mt-1 leading-6">{hint}</p> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="size-14 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 mb-4">
        <WifiOff className="size-7" />
      </div>
      <p className="font-medium">{message}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="shimmer h-4 w-1/3 rounded-md" />
          <div className="shimmer h-3 w-2/3 rounded-md" />
          <div className="shimmer h-3 w-1/2 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  )
}

// ─────────────────────────── Bottom Sheet انتخاب با جستجو ───────────────────────────

export interface SheetOption {
  id: string
  label: string
  hint?: string
}

export function SelectionSheet({
  open,
  onOpenChange,
  title,
  options,
  selected,
  multi,
  onConfirm,
  searchable = true,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  options: SheetOption[]
  selected: string[]
  multi?: boolean
  onConfirm: (ids: string[]) => void
  searchable?: boolean
}) {
  // محتوای داخلی فقط هنگام باز بودن mount می‌شود — state از props اولیه می‌گیرد
  if (!open) return null
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none max-h-[85dvh] flex flex-col">
          <SelectionSheetInner
            title={title}
            options={options}
            selected={selected}
            multi={multi}
            onConfirm={onConfirm}
            onOpenChange={onOpenChange}
            searchable={searchable}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function SelectionSheetInner({
  title,
  options,
  selected,
  multi,
  onConfirm,
  onOpenChange,
  searchable,
}: {
  title: string
  options: SheetOption[]
  selected: string[]
  multi?: boolean
  onConfirm: (ids: string[]) => void
  onOpenChange: (v: boolean) => void
  searchable: boolean
}) {
  const [query, setQuery] = useState('')
  const [temp, setTemp] = useState<string[]>(selected)

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return options
    return options.filter((o) => o.label.includes(q) || (o.hint ?? '').includes(q))
  }, [options, query])

  function toggle(id: string) {
    if (multi) {
      setTemp((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))
    } else {
      setTemp([id])
      onConfirm([id])
      onOpenChange(false)
    }
  }

  return (
    <>
          <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <Drawer.Title className="font-semibold">{title}</Drawer.Title>
            {multi ? (
              <span className="text-xs text-muted-foreground">
                {toFa(temp.length)} انتخاب شده
              </span>
            ) : null}
          </div>
          {searchable ? (
            <div className="px-5 pb-2 relative">
              <Search className="size-4 absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجو…"
                className="pr-9 bg-secondary border-0"
                inputMode="search"
              />
            </div>
          ) : null}
          <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">موردی پیدا نشد.</p>
            ) : (
              filtered.map((o) => {
                const isSel = temp.includes(o.id)
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggle(o.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl px-3 py-3 mb-1 text-right transition-colors min-h-11',
                      isSel ? 'bg-accent/10 text-accent' : 'hover:bg-secondary'
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center size-5 rounded-full border-2 shrink-0',
                        isSel ? 'bg-accent border-accent' : 'border-zinc-300'
                      )}
                    >
                      {isSel ? <Check className="size-3.5 text-white" /> : null}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{o.label}</span>
                      {o.hint ? <span className="block text-xs text-muted-foreground truncate">{o.hint}</span> : null}
                    </span>
                  </button>
                )
              })
            )}
          </div>
          {multi ? (
            <div className="safe-top px-5 pb-3 pt-2 border-t border-border">
              <Button className="w-full" onClick={() => { onConfirm(temp); onOpenChange(false) }}>
                تأیید انتخاب
              </Button>
            </div>
          ) : null}
    </>
  )
}

// ─────────────────────────── Bottom Navigation ───────────────────────────

import { Home, ListChecks, Bell, MoreHorizontal, Mic, ClipboardCheck, LayoutDashboard, ListTodo, CalendarCheck } from 'lucide-react'

const NAV_ITEMS_SUPERVISOR = [
  { name: 'supervisor-home', label: 'خانه', icon: Home },
  { name: 'entry-type-select', label: 'ثبت ورود', icon: Mic },
  { name: 'entry-history', label: 'ثبت‌ها', icon: ListChecks },
  { name: 'daily-tasks', label: 'وظایف', icon: ListTodo },
  { name: 'notifications', label: 'اعلان‌ها', icon: Bell },
  { name: 'profile', label: 'بیشتر', icon: MoreHorizontal },
] as const

const NAV_ITEMS_MANAGER = [
  { name: 'manager-dashboard', label: 'خانه', icon: LayoutDashboard },
  { name: 'pending-approvals', label: 'تأییدها', icon: ClipboardCheck },
  { name: 'daily-dashboard', label: 'روزانه', icon: CalendarCheck },
  { name: 'entry-history', label: 'ثبت‌ها', icon: ListChecks },
  { name: 'notifications', label: 'اعلان‌ها', icon: Bell },
  { name: 'profile', label: 'بیشتر', icon: MoreHorizontal },
] as const

export function BottomNav({ active }: { active: string }) {
  const navigate = useApp((s) => s.navigate)
  const role = useApp((s) => s.session?.user.role)
  const unread = useApp((s) => s.unreadCount)
  const items = role === 'PROJECT_MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN' ? NAV_ITEMS_MANAGER : NAV_ITEMS_SUPERVISOR

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border safe-bottom" aria-label="ناوبری اصلی">
      <div className={`max-w-lg mx-auto grid ${items.length === 6 ? 'grid-cols-6' : 'grid-cols-5'}`}>
        {items.map((item) => {
          const isActive = active === item.name
          const Icon = item.icon
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => navigate(item.name as never, undefined, true)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 pt-2 pb-1 min-h-14 relative',
                isActive ? 'text-accent' : 'text-muted-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="size-6" strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.name === 'notifications' && unread > 0 ? (
                <span className="absolute top-1.5 left-1/2 -translate-x-1/2 lg:left-[62%] size-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {unread > 9 ? '۹+' : toFa(unread)}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ─────────────────────────── کارت آماری ───────────────────────────

export function StatCard({
  label,
  value,
  dotColor,
  onClick,
}: {
  label: string
  value: string
  dotColor?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-xl border border-border bg-card p-3 text-right min-h-16 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-1.5 mb-1">
        {dotColor ? <span className={cn('size-2 rounded-full', dotColor)} /> : null}
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <span className="text-xl font-bold">{value}</span>
    </button>
  )
}

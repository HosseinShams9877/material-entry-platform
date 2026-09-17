"use client"

import { useCallback, useEffect, useState } from 'react'
import { Search, X, CalendarDays } from 'lucide-react'
import { Drawer } from 'vaul'
import { api, type EntryListItem } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, StatusBadge, TypeBadge, ListSkeleton, EmptyState, ErrorState } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { formatRelative, formatQty, toFa, formatJalaliFromISO } from '@/lib/fa'
import { Button } from '@/components/ui/button'
import { ERROR_MSG } from '@/components/app/messages'

const STATUS_FILTERS = [
  { key: 'ALL', label: 'همه' },
  { key: 'PENDING_REVIEW', label: 'در انتظار' },
  { key: 'APPROVED', label: 'تأیید شده' },
  { key: 'REJECTED', label: 'رد شده' },
  { key: 'CORRECTION_REQUESTED', label: 'نیازمند اصلاح' },
  { key: 'DRAFT', label: 'پیش‌نویس' },
  { key: 'CLOSED', label: 'بایگانی' },
]

export default function EntryHistory({ params }: { params?: Record<string, unknown> }) {
  const [entries, setEntries] = useState<EntryListItem[]>([])
  const [status, setStatus] = useState<string>((params?.status as string) ?? 'ALL')
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  const [dateSheet, setDateSheet] = useState<null | 'from' | 'to'>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const navigate = useApp((s) => s.navigate)


  const load = useCallback(
    async (p: number, st: string, q: string, f: string | null, t: string | null) => {
      setLoading(true)
      setError(false)
      try {
        const res = await api.get<{ entries: EntryListItem[]; pagination: { totalPages: number } }>(
          `/api/v1/material-entries?page=${p}&pageSize=15&status=${st}${q ? `&q=${encodeURIComponent(q)}` : ''}${f ? `&from=${f}` : ''}${t ? `&to=${t}` : ''}`
        )
        setEntries(res.entries)
        setTotalPages(res.pagination.totalPages)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(page, status, query, from, to)
  }, [page, status, from, to, load])

  const applyFilter = (st: string) => {
    setStatus(st)
    setPage(1)
    void load(1, st, query, from, to)
  }

  const search = () => {
    setPage(1)
    void load(1, status, query, from, to)
  }

  const clearDateFilter = () => {
    setFrom(null)
    setTo(null)
    setDateFilterOpen(false)
    setPage(1)
    void load(1, status, query, null, null)
  }

  const hasDateFilter = !!from || !!to

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="ثبت‌های ورود" subtitle="تاریخچه کامل با فیلتر" />
      <div className="safe-top" />

      {/* جستجو */}
      <div className="px-4 pt-3 relative">
        <Search className="size-4 absolute right-7 top-1/2 -translate-y-1/2 mt-1.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="جستجو در مصالح، مبدأ، سرپرست…"
          className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 pl-10 text-sm outline-none"
          inputMode="search"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setPage(1)
              void load(1, status, '', from, to)
            }}
            className="absolute left-7 top-1/2 -translate-y-1/2 mt-1.5"
            aria-label="پاک کردن"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      {/* فیلتر وضعیت + فیلتر تاریخ */}
      <div className="px-4 pt-2.5 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => applyFilter(f.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
              status === f.key ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
        {/* فیلتر بازهٔ تاریخ — تقویم شمسی پاپ‌آپ */}
        <button
          type="button"
          onClick={() => setDateFilterOpen(true)}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors inline-flex items-center gap-1.5 ${
            hasDateFilter ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
          }`}
          aria-label="فیلتر تاریخ"
        >
          <CalendarDays className="size-3.5" />
          {hasDateFilter
            ? from && to
              ? `${formatJalaliFromISO(from)} تا ${formatJalaliFromISO(to)}`
              : from
                ? `از ${formatJalaliFromISO(from)}`
                : `تا ${formatJalaliFromISO(to)}`
            : 'تاریخ'}
        </button>
      </div>

      {/* لیست */}
      {loading && entries.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : error && entries.length === 0 ? (
        <ErrorState message={ERROR_MSG} onRetry={() => void load(page, status, query, from, to)} />
      ) : entries.length === 0 ? (
        <EmptyState title="ثبتی پیدا نشد" hint="با این فیلترها هیچ ثبت ورودی وجود ندارد." />
      ) : (
        <div className="px-4 space-y-2.5 pb-8">
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => navigate('entry-detail', { id: e.id })}
              className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={e.status} size="sm" />
                  {e.currentVersion > 1 ? (
                    <span className="text-[10px] bg-zinc-800 text-white rounded-md px-1.5 py-0.5">نسخه {toFa(e.currentVersion)}</span>
                  ) : null}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatRelative(e.submittedAt ?? e.createdAt)}
                </span>
              </div>
              <p className="text-sm font-medium truncate">
                {e.items.length > 0
                  ? `${e.items[0].materialName} — ${formatQty(e.items[0].quantity)} ${e.items[0].unit}`
                  : 'بدون قلم'}
                {e.items.length > 1 ? ` + ${toFa(e.items.length - 1)} قلم` : ''}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-muted-foreground">
                <TypeBadge type={e.type} />
                {e.source ? <span>از {e.source}</span> : null}
                {e.projects.map((p) => (
                  <span key={p.id}>{p.name}</span>
                ))}
                <span className="mr-auto">شماره {toFa(e.entryNumber)}</span>
              </div>
            </button>
          ))}

          {/* صفحه‌بندی */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحه {toFa(page)} از {toFa(totalPages)}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                بعدی
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {/* شیت فیلتر تاریخ */}
      <Drawer.Root open={dateFilterOpen} onOpenChange={setDateFilterOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <Drawer.Title className="font-semibold px-5 pt-3">فیلتر بازهٔ تاریخ</Drawer.Title>
            <p className="text-xs text-muted-foreground px-5 pb-3">تقویم شمسی — بازهٔ ورود مصالح را انتخاب کنید</p>

            <div className="px-4 space-y-2 pb-2">
              <button
                type="button"
                onClick={() => setDateSheet('from')}
                className="w-full flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-4 py-3 min-h-12 text-right"
              >
                <span className="text-xs text-muted-foreground">از تاریخ</span>
                <span className="text-sm font-medium flex items-center gap-2">
                  {from ? formatJalaliFromISO(from) : <span className="text-muted-foreground">انتخاب…</span>}
                  <CalendarDays className="size-4 text-accent" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDateSheet('to')}
                className="w-full flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-4 py-3 min-h-12 text-right"
              >
                <span className="text-xs text-muted-foreground">تا تاریخ</span>
                <span className="text-sm font-medium flex items-center gap-2">
                  {to ? formatJalaliFromISO(to) : <span className="text-muted-foreground">انتخاب…</span>}
                  <CalendarDays className="size-4 text-accent" />
                </span>
              </button>
              {from && to && from > to ? (
                <p className="text-xs text-red-600">«از تاریخ» باید قبل یا هم‌روزِ «تا تاریخ» باشد.</p>
              ) : null}
            </div>

            <div className="safe-top px-5 pb-3 pt-2 border-t border-border flex gap-2">
              <Button variant="outline" className="flex-1" onClick={clearDateFilter}>
                پاک کردن
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setDateFilterOpen(false)
                  setPage(1)
                  void load(1, status, query, from, to)
                }}
              >
                اعمال فیلتر
              </Button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* پاپ‌آپ تقویم شمسی */}
      <JalaliCalendarSheet
        open={dateSheet === 'from'}
        onOpenChange={(o) => !o && setDateSheet(null)}
        value={from}
        onSelect={(iso) => setFrom(iso)}
        title="از تاریخ"
        disableFuture
      />
      <JalaliCalendarSheet
        open={dateSheet === 'to'}
        onOpenChange={(o) => !o && setDateSheet(null)}
        value={to}
        onSelect={(iso) => setTo(iso)}
        title="تا تاریخ"
        disableFuture
      />
    </div>
  )
}

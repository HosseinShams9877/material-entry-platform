"use client"

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Drawer } from 'vaul'
import { api, type PurchaseRequestListItem, type MasterDataWithSupervisors } from '@/lib/client'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, SelectionSheet } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { formatRelative, toFa, formatQty, formatJalaliFromISO } from '@/lib/fa'
import { PURCHASE_STATUS_STYLES } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/app'
import { ERROR_MSG } from '@/components/app/messages'
import { cn } from '@/lib/utils'

const STATUS_FILTERS = [
  { key: 'ALL', label: 'همه' },
  { key: 'PENDING', label: 'در انتظار تأیید' },
  { key: 'APPROVED', label: 'آماده خرید' },
  { key: 'ORDERED', label: 'خریداری‌شده' },
  { key: 'RECEIVED', label: 'دریافت‌شده' },
  { key: 'REJECTED', label: 'رد شده' },
]

const ALL = '__all__'

export function PurchaseStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const s = PURCHASE_STATUS_STYLES[status]
  if (!s) return null
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-medium', s.badge, size === 'sm' ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-xs')}>
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}

export default function PurchaseRequests() {
  const [items, setItems] = useState<PurchaseRequestListItem[]>([])
  const [status, setStatus] = useState('ALL')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // فیلترهای اختصاصی این صفحه — پروژه، بازهٔ تاریخ و درخواست‌کننده
  const [projects, setProjects] = useState<Array<{ id: string; name: string; code: string | null }>>([])
  const [requesters, setRequesters] = useState<Array<{ id: string; fullName: string }>>([])
  const [projectId, setProjectId] = useState<string>(ALL)
  const [requestedById, setRequestedById] = useState<string>(ALL)
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'project' | 'requester'>(null)
  const [dateOpen, setDateOpen] = useState(false)
  const [dateSheet, setDateSheet] = useState<null | 'from' | 'to'>(null)
  const navigate = useApp((s) => s.navigate)

  // گزینه‌های فیلتر از Master Data (Scope-aware — فقط پروژه‌ها/افراد قابل‌دسترسی کاربر)
  useEffect(() => {
    api
      .get<MasterDataWithSupervisors>('/api/v1/master')
      .then((m) => {
        setProjects(m.projects)
        setRequesters(m.supervisors ?? [])
      })
      .catch(() => undefined)
  }, [])

  const load = useCallback(
    async (p: number, st: string, pid: string, rid: string, f: string | null, t: string | null) => {
      setLoading(true)
      setError(false)
      try {
        const qs = `/api/v1/purchase-requests?page=${p}&pageSize=15${st !== 'ALL' ? `&status=${st}` : ''}${
          pid !== ALL ? `&projectId=${pid}` : ''
        }${rid !== ALL ? `&requestedById=${rid}` : ''}${f ? `&from=${f}` : ''}${t ? `&to=${t}` : ''}`
        const res = await api.get<{ requests: PurchaseRequestListItem[]; pagination: { totalPages: number } }>(qs)
        setItems(res.requests)
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
    void load(page, status, projectId, requestedById, from, to)
  }, [page, status, projectId, requestedById, from, to, load])

  const applyFilter = (st: string) => {
    setStatus(st)
    setPage(1)
  }

  const clearDateFilter = () => {
    setFrom(null)
    setTo(null)
    setDateOpen(false)
    setPage(1)
  }

  const hasDateFilter = !!from || !!to
  const projectName = projects.find((p) => p.id === projectId)?.name
  const requesterName = requesters.find((r) => r.id === requestedById)?.fullName

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="درخواست‌های خرید" subtitle="از اعلام نیاز انبار تا خرید، دریافت و تسویه" />
      <div className="safe-top" />

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
      </div>

      {/* فیلترهای پروژه / درخواست‌کننده / تاریخ — مخصوص این صفحه */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setSheet('project')}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
            projectId !== ALL ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          {projectName ?? 'پروژه'}
        </button>
        <button
          type="button"
          onClick={() => setSheet('requester')}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
            requestedById !== ALL ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          {requesterName ?? 'درخواست‌کننده'}
        </button>
        <button
          type="button"
          onClick={() => setDateOpen(true)}
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

      {loading && items.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : error && items.length === 0 ? (
        <ErrorState message={ERROR_MSG} onRetry={() => void load(page, status, projectId, requestedById, from, to)} />
      ) : items.length === 0 ? (
        <EmptyState title="درخواستی پیدا نشد" hint="با این فیلتر هیچ درخواست خریدی ثبت نشده است." />
      ) : (
        <div className="px-4 space-y-2.5 pb-8">
          {items.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate('purchase-detail', { id: r.id })}
              className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <PurchaseStatusBadge status={r.status} />
                  {r.isStale ? (
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 text-red-700 px-2.5 py-0.5 text-[10px] font-bold">
                      بی‌پاسخ ۲۴ ساعت
                    </span>
                  ) : null}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  شماره {toFa(r.number)} · {formatRelative(r.createdAt)}
                </span>
              </div>
              <p className="text-sm font-medium truncate">{r.itemsPreview || 'اقلام مصالح'}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-muted-foreground">
                <span>{r.workshopName}</span>
                {r.projectName ? <span>· {r.projectName}</span> : null}
                <span>· {r.requestedByName}</span>
                {r.supplierName ? <span>· فروشنده: {r.supplierName}</span> : null}
                {r.hasInvoice ? <span className="text-accent">· فاکتور ✓</span> : null}
                <span className="mr-auto font-bold text-foreground">{toFa(formatQty(r.itemsCount))} قلم</span>
              </div>
            </button>
          ))}

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

      {/* انتخاب پروژه / درخواست‌کننده — استفاده از SelectionSheet مشابه فرم ثبت */}
      <SelectionSheet
        open={sheet === 'project'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس پروژه"
        selected={[]}
        options={[{ id: ALL, label: 'همه پروژه‌ها' }, ...projects.map((p) => ({ id: p.id, label: p.name, hint: p.code ? `کد ${p.code}` : undefined }))]}
        onConfirm={(ids) => {
          setProjectId(ids[0] ?? ALL)
          setPage(1)
        }}
      />
      <SelectionSheet
        open={sheet === 'requester'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس درخواست‌کننده"
        selected={[]}
        options={[{ id: ALL, label: 'همه درخواست‌کنندگان' }, ...requesters.map((r) => ({ id: r.id, label: r.fullName }))]}
        onConfirm={(ids) => {
          setRequestedById(ids[0] ?? ALL)
          setPage(1)
        }}
      />

      {/* شیت فیلتر تاریخ — مشابه صفحهٔ ثبت‌های ورود */}
      <Drawer.Root open={dateOpen} onOpenChange={setDateOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <Drawer.Title className="font-semibold px-5 pt-3">فیلتر بازهٔ تاریخ</Drawer.Title>
            <p className="text-xs text-muted-foreground px-5 pb-3">تقویم شمسی — بازهٔ ثبت درخواست خرید را انتخاب کنید</p>

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
              <Button className="flex-1" onClick={() => setDateOpen(false)}>
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

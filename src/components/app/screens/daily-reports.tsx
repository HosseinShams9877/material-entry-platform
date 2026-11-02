"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ChevronLeft, CalendarDays, ListTodo, SlidersHorizontal, X } from 'lucide-react'
import { api, type DailyReportListItem, type MasterData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, ReportStatusBadge, SelectionSheet } from '@/components/app/shared'
import { Button } from '@/components/ui/button'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { formatJalaliTehran, formatRelative, toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

const FILTERS = [
  { key: '', label: 'همه' },
  { key: 'DRAFT', label: 'پیش‌نویس' },
  { key: 'SUBMITTED', label: 'ارسال‌شده' },
  { key: 'REVIEWED', label: 'بررسی‌شده' },
] as const

type SheetKind = 'workshop' | 'project' | 'reporter' | 'from' | 'to' | null

// ─────────────────────────── فهرست گزارش‌های روزانه + فیلتر ───────────────────────────
// فیلترها: کارگاه، پروژه، نویسندهٔ گزارش، بازهٔ تاریخ (شمسی)

export default function DailyReports() {
  const [reports, setReports] = useState<DailyReportListItem[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const navigate = useApp((s) => s.navigate)
  const role = useApp((s) => s.session?.user.role)
  const canCreate = role === 'SITE_SUPERVISOR' || role === 'PROJECT_MANAGER'

  // فیلترها
  const [md, setMd] = useState<MasterData | null>(null)
  const [workshopId, setWorkshopId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [reporterId, setReporterId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  useEffect(() => {
    api.get<MasterData>('/api/v1/master').then(setMd).catch(() => undefined)
  }, [])

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '30' })
    if (filter) params.set('status', filter)
    if (workshopId) params.set('workshopId', workshopId)
    if (projectId) params.set('projectId', projectId)
    if (reporterId) params.set('reporterId', reporterId)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params
  }, [filter, workshopId, projectId, reporterId, fromDate, toDate])

  const queryString = buildParams().toString()

  useEffect(() => {
    let alive = true
    api
      .get<{ reports: DailyReportListItem[] }>(`/api/v1/daily-reports?${queryString}`)
      .then((res) => {
        if (!alive) return
        setReports(res.reports)
        setError('')
      })
      .catch(() => {
        if (alive) setError(ERROR_MSG)
      })
    return () => {
      alive = false
    }
  }, [queryString])

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ reports: DailyReportListItem[] }>(`/api/v1/daily-reports?${queryString}`)
      setReports(res.reports)
      setError('')
    } catch {
      setError(ERROR_MSG)
    }
  }, [queryString])

  const activeFilterCount = [workshopId, projectId, reporterId, fromDate, toDate].filter(Boolean).length

  // نویسنده‌های ممکن — از داده‌های master نمی‌آید؛ از لیست گزارش‌های فعلی استخراج می‌شود
  const reporterOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of reports ?? []) map.set(r.reporterId, r.reporterName)
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }))
  }, [reports])

  const projectOptions = useMemo(
    () =>
      (md?.projects ?? [])
        .filter((p) => !workshopId || p.workshopId === null || p.workshopId === workshopId)
        .map((p) => ({ id: p.id, label: p.name, hint: p.code })),
    [md, workshopId]
  )

  function clearFilters() {
    setWorkshopId('')
    setProjectId('')
    setReporterId('')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="max-w-lg mx-auto">
      <ScreenHeader
        title="گزارش‌های روزانه"
        subtitle="گزارش سرپرستان به مدیران"
        right={
          <div className="flex items-center gap-1.5">
            <Button
              variant={activeFilterCount > 0 ? 'default' : 'outline'}
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setFilterOpen((v) => !v)}
              aria-label="فیلترها"
            >
              <SlidersHorizontal className="size-4" />
              فیلتر{activeFilterCount > 0 ? ` (${toFa(activeFilterCount)})` : ''}
            </Button>
            {canCreate ? (
              <Button size="sm" className="h-9 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => navigate('daily-report-form')}>
                <Plus className="size-4" />
                جدید
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="px-4 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* پنل فیلترها */}
      {filterOpen ? (
        <div className="mx-4 mb-2 rounded-xl border border-border bg-card p-3.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSheet('workshop')}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-right min-h-11"
            >
              <span className="block text-[10px] text-muted-foreground">کارگاه</span>
              <span className="block text-xs font-medium truncate">{md?.workshops.find((w) => w.id === workshopId)?.name ?? 'همه'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSheet('project')}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-right min-h-11"
            >
              <span className="block text-[10px] text-muted-foreground">پروژه</span>
              <span className="block text-xs font-medium truncate">
                {md?.projects.find((p) => p.id === projectId)?.name ?? 'همه'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSheet('reporter')}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-right min-h-11"
            >
              <span className="block text-[10px] text-muted-foreground">نویسنده</span>
              <span className="block text-xs font-medium truncate">
                {(reports ?? []).find((r) => r.reporterId === reporterId)?.reporterName ?? 'همه'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSheet('from')}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-right min-h-11"
            >
              <span className="block text-[10px] text-muted-foreground flex items-center gap-1">
                <CalendarDays className="size-3" /> از تاریخ
              </span>
              <span className="block text-xs font-medium">{fromDate ? formatJalaliTehran(fromDate) : '—'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSheet('to')}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-right min-h-11"
            >
              <span className="block text-[10px] text-muted-foreground flex items-center gap-1">
                <CalendarDays className="size-3" /> تا تاریخ
              </span>
              <span className="block text-xs font-medium">{toDate ? formatJalaliTehran(toDate) : '—'}</span>
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-center min-h-11 text-xs font-medium text-muted-foreground flex items-center justify-center gap-1"
            >
              <X className="size-3.5" />
              پاک‌کردن فیلترها
            </button>
          </div>
          {fromDate && toDate && fromDate > toDate ? (
            <p className="text-[11px] text-red-500">تاریخ «از» بعد از «تا» است.</p>
          ) : null}
        </div>
      ) : null}

      <div className="px-4 pb-6">
        {error ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void reload()} />
        ) : !reports ? (
          <ListSkeleton rows={4} />
        ) : reports.length === 0 ? (
          <EmptyState
            title="گزارشی یافت نشد"
            hint={activeFilterCount > 0 ? 'با این فیلترها گزارشی پیدا نشد — فیلترها را تغییر دهید.' : canCreate ? 'با دکمهٔ «گزارش جدید» گزارش امروز را ثبت کنید.' : 'هنوز گزارشی ارسال نشده است.'}
            icon={<ListTodo className="size-7" />}
          />
        ) : (
          <div className="space-y-2.5">
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate('daily-report-detail', { id: r.id })}
                className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <ReportStatusBadge status={r.status} size="sm" />
                  <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
                </div>
                <p className="text-sm font-medium leading-6">{r.title}</p>
                <p className="text-xs text-muted-foreground leading-5 mt-1 line-clamp-2">{r.content}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {formatJalaliTehran(r.reportDate)}
                  </span>
                  <span>· {r.reporterName}</span>
                  <span>· {r.projectName}</span>
                  <span>· {r.workshopName}</span>
                  {r.submittedAt ? <span>· ارسال {formatRelative(r.submittedAt)}</span> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* شیت‌های انتخاب فیلتر */}
      <SelectionSheet
        open={sheet === 'workshop'}
        onOpenChange={(v) => setSheet(v ? 'workshop' : null)}
        title="فیلتر کارگاه"
        options={(md?.workshops ?? []).map((w) => ({ id: w.id, label: w.name, hint: w.code }))}
        selected={workshopId ? [workshopId] : []}
        onConfirm={(ids) => {
          setWorkshopId(ids[0] ?? '')
          const prj = md?.projects.find((p) => p.id === projectId)
          if (prj && prj.workshopId && ids[0] && prj.workshopId !== ids[0]) setProjectId('')
        }}
      />
      <SelectionSheet
        open={sheet === 'project'}
        onOpenChange={(v) => setSheet(v ? 'project' : null)}
        title="فیلتر پروژه"
        options={projectOptions}
        selected={projectId ? [projectId] : []}
        onConfirm={(ids) => setProjectId(ids[0] ?? '')}
      />
      <SelectionSheet
        open={sheet === 'reporter'}
        onOpenChange={(v) => setSheet(v ? 'reporter' : null)}
        title="فیلتر نویسنده"
        options={reporterOptions}
        selected={reporterId ? [reporterId] : []}
        onConfirm={(ids) => setReporterId(ids[0] ?? '')}
      />
      <JalaliCalendarSheet
        open={sheet === 'from'}
        onOpenChange={(v) => setSheet(v ? 'from' : null)}
        title="از تاریخ"
        value={fromDate}
        onSelect={(iso) => setFromDate(iso)}
        disableFuture={false}
      />
      <JalaliCalendarSheet
        open={sheet === 'to'}
        onOpenChange={(v) => setSheet(v ? 'to' : null)}
        title="تا تاریخ"
        value={toDate}
        onSelect={(iso) => setToDate(iso)}
        disableFuture={false}
      />
    </div>
  )
}

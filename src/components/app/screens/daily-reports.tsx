"use client"

import { useCallback, useEffect, useState } from 'react'
import { Plus, ChevronLeft, CalendarDays, ListTodo } from 'lucide-react'
import { api, type DailyReportListItem } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, ReportStatusBadge } from '@/components/app/shared'
import { Button } from '@/components/ui/button'
import { formatJalaliTehran, formatRelative, toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

const FILTERS = [
  { key: '', label: 'همه' },
  { key: 'DRAFT', label: 'پیش‌نویس' },
  { key: 'SUBMITTED', label: 'ارسال‌شده' },
  { key: 'REVIEWED', label: 'بررسی‌شده' },
] as const

export default function DailyReports() {
  const [reports, setReports] = useState<DailyReportListItem[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const navigate = useApp((s) => s.navigate)
  const role = useApp((s) => s.session?.user.role)
  const canCreate = role === 'WORKSHOP_SUPERVISOR' || role === 'SUPER_ADMIN' || role === 'ADMIN'

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pageSize: '30' })
      if (filter) params.set('status', filter)
      const res = await api.get<{ reports: DailyReportListItem[] }>(`/api/v1/daily-reports?${params.toString()}`)
      setReports(res.reports)
      setError('')
    } catch {
      setError(ERROR_MSG)
    }
  }, [filter])

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams({ pageSize: '30' })
    if (filter) params.set('status', filter)
    api
      .get<{ reports: DailyReportListItem[] }>(`/api/v1/daily-reports?${params.toString()}`)
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
  }, [filter])

  return (
    <div className="max-w-lg mx-auto">
      <ScreenHeader
        title="گزارش‌های روزانه"
        subtitle="گزارش سرپرستان به مدیران"
        right={
          canCreate ? (
            <Button size="sm" className="h-9 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => navigate('daily-report-form')}>
              <Plus className="size-4" />
              گزارش جدید
            </Button>
          ) : undefined
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

      <div className="px-4 pb-6">
        {error ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : !reports ? (
          <ListSkeleton rows={4} />
        ) : reports.length === 0 ? (
          <EmptyState
            title="گزارشی یافت نشد"
            hint={canCreate ? 'با دکمهٔ «گزارش جدید» گزارش امروز را ثبت کنید.' : 'هنوز گزارشی ارسال نشده است.'}
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
                  {r.submittedAt ? <span>· ارسال {formatRelative(r.submittedAt)}</span> : null}
                  {r.status === 'DRAFT' ? <span className="text-amber-600">· پیش‌نویس ({toFa(1)})</span> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

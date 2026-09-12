"use client"

import { useCallback, useEffect, useState } from 'react'
import { Activity, AlarmClock, CalendarDays, ClipboardList, FileText, Users, ChevronLeft } from 'lucide-react'
import { api, type DailyDashboardData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, ListSkeleton, ErrorState, TaskStatusBadge, ReportStatusBadge } from '@/components/app/shared'
import { TaskProgress } from '@/components/app/daily-shared'
import { Button } from '@/components/ui/button'
import { formatJalaliDateTime, formatJalaliFromISO, formatRelative, toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

const TIMELINE_LABELS: Record<string, string> = {
  CREATE_DAILY_TASK: 'ایجاد وظیفه',
  UPDATE_DAILY_TASK: 'ویرایش وظیفه',
  SEND_DAILY_TASK: 'ارسال وظیفه',
  COMPLETE_TASK_ITEM: 'انجام آیتم',
  UNCOMPLETE_TASK_ITEM: 'برداشتن تیک',
  COMPLETE_DAILY_TASK: 'تکمیل وظیفه',
  CANCEL_DAILY_TASK: 'لغو وظیفه',
  CREATE_DAILY_REPORT: 'ایجاد گزارش',
  SUBMIT_DAILY_REPORT: 'ارسال گزارش',
  REVIEW_DAILY_REPORT: 'بررسی گزارش',
  UPLOAD_TASK_AUDIO: 'بارگذاری صوت وظیفه',
  UPLOAD_REPORT_AUDIO: 'بارگذاری صوت گزارش',
  TRANSCRIBE_AUDIO: 'تبدیل صوت به متن',
  TRANSCRIPTION_FAILED: 'شکست تبدیل صوت',
}

export default function DailyDashboard() {
  const [data, setData] = useState<DailyDashboardData | null>(null)
  const [error, setError] = useState('')
  const navigate = useApp((s) => s.navigate)

  const load = useCallback(async () => {
    try {
      setData(await api.get<DailyDashboardData>('/api/v1/daily-dashboard'))
      setError('')
    } catch {
      setError(ERROR_MSG)
    }
  }, [])

  useEffect(() => {
    let alive = true
    api
      .get<DailyDashboardData>('/api/v1/daily-dashboard')
      .then((res) => {
        if (!alive) return
        setData(res)
        setError('')
      })
      .catch(() => {
        if (alive) setError(ERROR_MSG)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="max-w-lg mx-auto">
      <ScreenHeader
        title="وظایف و گزارش روزانه"
        subtitle="وضعیت کارگاه‌ها و پروژه‌های شما"
        right={
          <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => navigate('daily-tasks')}>
            همه وظایف
            <ChevronLeft className="size-4" />
          </Button>
        }
      />

      <div className="p-4 space-y-5">
        {error ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : !data ? (
          <ListSkeleton rows={5} />
        ) : (
          <>
            {/* شمارنده‌ها */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] text-muted-foreground mb-1">وظایف امروز</p>
                <p className="text-xl font-bold">{toFa(data.stats.todayTasks)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] text-muted-foreground mb-1">تکمیل‌شده</p>
                <p className="text-xl font-bold text-green-600">{toFa(data.stats.completedTasks)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[11px] text-muted-foreground mb-1">در انتظار</p>
                <p className="text-xl font-bold text-amber-600">{toFa(data.stats.pendingTasks)}</p>
              </div>
            </div>

            {/* درصد پیشرفت */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold mb-2">درصد پیشرفت وظایف فعال</p>
              <TaskProgress value={data.stats.progressPercent} />
            </div>

            {/* دارای تأخیر */}
            {data.overdue.length > 0 ? (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5 text-red-600">
                  <AlarmClock className="size-4" />
                  وظایف دارای تأخیر ({toFa(data.stats.overdueCount)})
                </h2>
                {data.overdue.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => navigate('daily-task-detail', { id: t.id })}
                    className="w-full rounded-xl border border-red-200 bg-red-50/60 p-3 text-right active:scale-[0.99] transition-transform"
                  >
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t.assignees.join('، ')} {t.dueDate ? `· مهلت: ${formatJalaliDateTime(t.dueDate)}` : ''} · {toFa(t.progress)}٪
                    </p>
                  </button>
                ))}
              </div>
            ) : null}

            {/* گزارش‌های جدید */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="size-4 text-accent" />
                  گزارش‌های روزانه
                  {data.stats.newReports > 0 ? (
                    <span className="rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5">
                      {toFa(data.stats.newReports)} جدید
                    </span>
                  ) : null}
                </h2>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => navigate('daily-reports')}>
                  همه
                  <ChevronLeft className="size-3.5" />
                </Button>
              </div>
              {data.reports.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">گزارشی ثبت نشده است.</p>
              ) : (
                data.reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => navigate('daily-report-detail', { id: r.id })}
                    className="w-full rounded-xl border border-border bg-card p-3 text-right active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <ReportStatusBadge status={r.status} size="sm" />
                      <span className="text-[11px] text-muted-foreground">{formatJalaliFromISO(new Date(r.reportDate).toISOString().slice(0, 10))}</span>
                    </div>
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {r.reporterName} · {r.workshopName} {r.hasAudio ? '· صوتی' : ''}
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* وظایف اخیر */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <ClipboardList className="size-4 text-accent" />
                وظایف اخیر
              </h2>
              {data.tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate('daily-task-detail', { id: t.id })}
                  className="w-full rounded-xl border border-border bg-card p-3 text-right active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <TaskStatusBadge status={t.status} size="sm" />
                    {t.isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-medium">
                        <AlarmClock className="size-3" />
                        تأخیر
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t.projectName} · {t.createdByName} → {t.assignees.join('، ') || '—'}
                  </p>
                  <div className="mt-2">
                    <TaskProgress value={t.progress} />
                  </div>
                </button>
              ))}
            </div>

            {/* آخرین فعالیت سرپرستان */}
            {data.supervisorActivity.length > 0 ? (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="size-4 text-accent" />
                  آخرین فعالیت سرپرستان
                </h2>
                {data.supervisorActivity.map((s) => (
                  <div key={s.userId} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                    <span className="text-sm">{s.fullName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {TIMELINE_LABELS[s.action] ?? s.action} · {formatRelative(s.lastAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Timeline */}
            {data.timeline.length > 0 ? (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <Activity className="size-4 text-accent" />
                  فعالیت‌های اخیر
                </h2>
                <div className="rounded-xl border border-border bg-card divide-y divide-border">
                  {data.timeline.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{TIMELINE_LABELS[t.action] ?? t.action}</p>
                        <p className="text-[10px] text-muted-foreground">{t.userName}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {formatJalaliDateTime(t.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

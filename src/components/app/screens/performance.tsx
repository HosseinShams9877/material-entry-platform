"use client"

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Users, ChevronRight, ChevronLeft, Target, FileText, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ClientApiError } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, EmptyState, ErrorState, ListSkeleton } from '@/components/app/shared'
import { toFa, toEnDigits, formatJalaliFromISO } from '@/lib/fa'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

// ─────────────────────────── صفحهٔ ارزیابی و KPI نیروها (سند سیستم یکپارچه) ───────────────────────────
// هدف ماهانه + درصد تحقق + عملکرد (تعداد گزارش کار، مجموع نفرات، آخرین فعالیت)
// + خلاصهٔ دوره‌ای به تفکیک کارگاه (تجمیع خودکار گزارش‌های روزانه).

function toEn(s: string): string {
  return toEnDigits(s).replace(/[^\d.]/g, '')
}

interface WorkerRow {
  workerId: string
  name: string
  jobTitle: string | null
  isActive: boolean
  workshopName: string | null
  reportsCount: number
  crewSum: number
  lastReportAt: string | null
  goal: { id: string; targetReports: number; note: string | null; achievementPct: number | null } | null
}

interface PerformanceData {
  period: string
  monthLabel: string
  workers: WorkerRow[]
  byWorkshop: Array<{ workshopId: string; workshopName: string; reportsCount: number; crewSum: number }>
  canManage: boolean
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function Performance() {
  const session = useApp((s) => s.session)
  const [period, setPeriod] = useState<string>(() => {
    const n = new Date()
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`
  })
  const [data, setData] = useState<PerformanceData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const [goalTarget, setGoalTarget] = useState<WorkerRow | null>(null)
  const [goalValue, setGoalValue] = useState('')
  const [goalSaving, setGoalSaving] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const d = await api.get<PerformanceData>(`/api/v1/performance?month=${period}`)
      setData(d)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  async function submitGoal() {
    if (!goalTarget) return
    const val = Number(toEn(goalValue) || '0')
    if (!Number.isInteger(val) || val < 1) {
      toast.error('تعداد هدف را وارد کنید (عدد صحیح بزرگ‌تر از صفر).')
      return
    }
    setGoalSaving(true)
    try {
      await api.post('/api/v1/performance/goals', {
        workerId: goalTarget.workerId,
        period,
        targetReports: val,
      })
      toast.success(`هدف ماهانهٔ «${goalTarget.name}» ثبت شد.`)
      setGoalTarget(null)
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    } finally {
      setGoalSaving(false)
    }
  }

  async function removeGoal(w: WorkerRow) {
    if (!w.goal) return
    try {
      await api.del(`/api/v1/performance/goals?id=${encodeURIComponent(w.goal.id)}`)
      toast.success('هدف حذف شد.')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    }
  }

  const canManage = (session?.permissions ?? []).includes('performance.manage')

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="ارزیابی و KPI"
        subtitle="عملکرد ماهانهٔ نیروها و تحقق اهداف"
      />

      {/* انتخاب ماه */}
      <div className="p-4 pb-0">
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-2">
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setPeriod((p) => shiftPeriod(p, -1))} aria-label="ماه قبل">
            <ChevronRight className="size-5" />
          </Button>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-accent" />
            <span className="text-sm font-bold">{data?.monthLabel ?? period}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => {
              const next = shiftPeriod(period, 1)
              const now = new Date()
              const nowP = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
              if (next <= nowP) setPeriod(next)
            }}
            aria-label="ماه بعد"
          >
            <ChevronLeft className="size-5" />
          </Button>
        </div>
      </div>

      <div className="p-4">
        {error ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : loading ? (
          <ListSkeleton rows={5} />
        ) : !data || data.workers.length === 0 ? (
          <EmptyState
            title="گزارش کار ثبت نشده است"
            hint="با ثبت «گزارش کار» توسط سرپرست یا خودِ نیرو، عملکرد این‌جا تجمیع می‌شود."
            icon={<Users className="size-7" />}
          />
        ) : (
          <>
            {/* خلاصهٔ دوره به تفکیک کارگاه */}
            {data.byWorkshop.length > 0 ? (
              <div className="rounded-xl border border-border bg-card p-3.5 mb-3">
                <p className="text-xs font-semibold mb-2">تجمیع دوره — گزارش‌های ثبت‌شده</p>
                <div className="space-y-1.5">
                  {data.byWorkshop.map((w) => (
                    <div key={w.workshopId} className="flex items-center justify-between text-xs">
                      <span className="truncate">{w.workshopName}</span>
                      <span className="text-muted-foreground shrink-0 numeric-input">
                        {toFa(w.reportsCount)} گزارش · {toFa(w.crewSum)} نفر-روز
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* کارت نیروها */}
            <div className="space-y-2">
              {data.workers.map((w) => (
                <div key={w.workerId} className={cn('rounded-xl border bg-card p-3.5', !w.isActive && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{w.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {w.jobTitle ? `${w.jobTitle} · ` : ''}{w.workshopName ?? '—'}
                      </p>
                    </div>
                    {w.goal?.achievementPct != null ? (
                      <span
                        className={cn(
                          'text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0',
                          w.goal.achievementPct >= 100
                            ? 'bg-green-100 text-green-700'
                            : w.goal.achievementPct >= 50
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-600'
                        )}
                      >
                        {toFa(w.goal.achievementPct)}٪ تحقق
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                    <div className="rounded-lg bg-secondary/70 py-1.5">
                      <p className="text-[10px] text-muted-foreground">گزارش کار</p>
                      <p className="text-xs font-bold numeric-input">{toFa(w.reportsCount)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/70 py-1.5">
                      <p className="text-[10px] text-muted-foreground">مجموع نفرات</p>
                      <p className="text-xs font-bold numeric-input">{toFa(w.crewSum)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/70 py-1.5">
                      <p className="text-[10px] text-muted-foreground">آخرین گزارش</p>
                      <p className="text-[11px] font-bold numeric-input truncate">
                        {w.lastReportAt ? formatJalaliFromISO(w.lastReportAt.slice(0, 10)) : '—'}
                      </p>
                    </div>
                  </div>

                  {w.goal ? (
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                        <span>هدف ماهانه: {toFa(w.goal.targetReports)} گزارش</span>
                        <span className="numeric-input">{toFa(w.reportsCount)} / {toFa(w.goal.targetReports)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', (w.goal.achievementPct ?? 0) >= 100 ? 'bg-green-500' : 'bg-amber-500')}
                          style={{ width: `${Math.min(100, w.goal.achievementPct ?? 0)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {canManage && data.canManage ? (
                    <div className="flex gap-1.5 mt-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-[11px] gap-1"
                        onClick={() => { setGoalTarget(w); setGoalValue(w.goal ? String(w.goal.targetReports) : '') }}
                      >
                        <Target className="size-3.5" />
                        {w.goal ? 'ویرایش هدف' : 'تعیین هدف'}
                      </Button>
                      {w.goal ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-[11px] border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => void removeGoal(w)}
                        >
                          حذف هدف
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2.5 rounded-xl bg-secondary/60 p-3 mt-4">
              <FileText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] leading-5 text-muted-foreground">
                عملکرد هر نیرو از «گزارش کار»های ثبت‌شده در این ماه محاسبه می‌شود. برای تعیین شاخص عملکردی، هدف ماهانهٔ هر نیرو را مشخص کنید تا درصد تحقق نمایش داده شود.
              </p>
            </div>
          </>
        )}
      </div>

      {/* شیت تعیین هدف */}
      {goalTarget ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setGoalTarget(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">هدف ماهانه — {data?.monthLabel}</h3>
            <p className="text-[11px] text-muted-foreground mb-4">نیرو: {goalTarget.name}</p>
            <div className="space-y-3">
              <Input
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
                placeholder="تعداد گزارش کار مورد انتظار در ماه"
                className="h-11 numeric-input bg-secondary/60"
                inputMode="numeric"
              />
              <Button className="w-full h-12" onClick={() => void submitGoal()} disabled={goalSaving}>
                {goalSaving ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}
                ذخیرهٔ هدف
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

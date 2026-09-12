"use client"

import { useEffect, useState } from 'react'
import { ClipboardCheck, Clock3, CheckCircle2, ArrowLeftRight, HandCoins, Building2, ChevronLeft, FileBarChart, Timer, AlarmClock, ListTodo, CheckCheck, FileText } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api, type DashboardManager } from '@/lib/client'
import { useApp } from '@/store/app'
import { StatCard, ListSkeleton, StatusBadge, TypeBadge } from '@/components/app/shared'
import { ENTRY_TYPES } from '@/lib/permissions'
import { formatRelative, formatQty, toFa, formatJalaliFromISO } from '@/lib/fa'
import { Button } from '@/components/ui/button'
import { ERROR_MSG } from '@/components/app/messages'

export default function ManagerDashboard() {
  const [data, setData] = useState<DashboardManager | null>(null)
  const [error, setError] = useState('')
  const navigate = useApp((s) => s.navigate)
  const session = useApp((s) => s.session)

  useEffect(() => {
    api
      .get<DashboardManager>('/api/v1/dashboard')
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch(() => setError(ERROR_MSG))
  }, [])

  function retry() {
    setError('')
    api
      .get<DashboardManager>('/api/v1/dashboard')
      .then(setData)
      .catch(() => setError(ERROR_MSG))
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="safe-top bg-zinc-900 text-white px-5 pt-6 pb-14 rounded-b-3xl -mb-10">
        <p className="text-xs text-zinc-400">داشبورد مدیریت</p>
        <h1 className="text-lg font-bold mt-0.5">{session?.user.fullName}</h1>
        <p className="text-xs text-zinc-400 mt-1">مدیر پروژه — {session?.projects[0]?.name ?? 'همه پروژه‌ها'}</p>
      </div>

      {/* وضعیت‌ها */}
      <div className="px-4 mb-5">
        {error ? (
          <button onClick={retry} className="w-full rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm p-4 text-right">
            {ERROR_MSG} — لمس برای تلاش دوباره
          </button>
        ) : !data ? (
          <ListSkeleton rows={1} />
        ) : (
          <>
            <div className="flex gap-2 mb-2.5">
              <StatCard label="در انتظار تأیید" value={toFa(data.counts.pending)} dotColor="bg-yellow-500" onClick={() => navigate('pending-approvals')} />
              <StatCard label="نیازمند اصلاح" value={toFa(data.counts.correction)} dotColor="bg-orange-500" />
            </div>
            <div className="flex gap-2">
              <StatCard label="تأیید شده" value={toFa(data.counts.approved)} dotColor="bg-green-600" />
              <StatCard label="رد شده" value={toFa(data.counts.rejected)} dotColor="bg-red-600" />
              <StatCard label="ثبت امروز" value={toFa(data.today.total)} dotColor="bg-blue-600" />
            </div>

            {/* KPI های مدیریتی */}
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <Timer className="size-4 mx-auto text-accent mb-1" />
                <p className="text-base font-bold numeric-input">{data.kpis.avgApprovalMinutes !== null ? `${toFa(data.kpis.avgApprovalMinutes)}` : '—'}</p>
                <p className="text-[10px] text-muted-foreground">میانگین تأیید (دقیقه)</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <AlarmClock className={"size-4 mx-auto mb-1 " + (data.kpis.delayedCount > 0 ? 'text-red-600' : 'text-muted-foreground')} />
                <p className={"text-base font-bold numeric-input " + (data.kpis.delayedCount > 0 ? 'text-red-600' : '')}>{toFa(data.kpis.delayedCount)}</p>
                <p className="text-[10px] text-muted-foreground">تأیید با تأخیر ۲۴h</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <FileText className="size-4 mx-auto text-accent mb-1" />
                <p className="text-base font-bold numeric-input">{toFa(data.kpis.reportsToday)}</p>
                <p className="text-[10px] text-muted-foreground">گزارش امروز</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <ListTodo className="size-4 mx-auto text-accent mb-1" />
                <p className="text-base font-bold numeric-input">{toFa(data.kpis.openTasks)}</p>
                <p className="text-[10px] text-muted-foreground">وظایف باز</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <CheckCheck className="size-4 mx-auto text-green-600 mb-1" />
                <p className="text-base font-bold numeric-input">{toFa(data.kpis.completedTasksToday)}</p>
                <p className="text-[10px] text-muted-foreground">وظایف انجام امروز</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ثبت‌های جدید برای بررسی */}
      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <ClipboardCheck className="size-4" />
            در انتظار بررسی شما
          </h2>
          {data && data.counts.pending > 0 ? (
            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => navigate('pending-approvals')}>
              همه
              <ChevronLeft className="size-4" />
            </Button>
          ) : null}
        </div>
        {!data ? (
          <ListSkeleton rows={2} />
        ) : data.pendingReview.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
            <CheckCircle2 className="size-9 mx-auto text-green-600 mb-2" />
            <p className="text-sm font-medium">همه ثبت‌ها بررسی شده‌اند</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.pendingReview.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => navigate('entry-detail', { id: e.id })}
                className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <StatusBadge status={e.status} size="sm" />
                  <span className="text-[11px] text-muted-foreground">{formatRelative(e.submittedAt)}</span>
                </div>
                <p className="text-sm font-medium truncate">
                  {e.firstItem ? `${e.firstItem.materialName} — ${formatQty(e.firstItem.quantity)} ${e.firstItem.unit}` : 'بدون قلم'}
                  {e.itemsCount > 1 ? ` + ${toFa(e.itemsCount - 1)}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] text-muted-foreground">
                  <TypeBadge type={e.type} />
                  <span>{e.supervisorName}</span>
                  {e.projects.slice(0, 1).map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {data ? (
        <>
          {/* نمودار روند ۱۴ روز */}
          <div className="px-4 mb-5">
            <h2 className="text-sm font-semibold mb-2.5">روند ثبت مصالح (۱۴ روز اخیر)</h2>
            <div className="rounded-2xl border border-border bg-card p-3" dir="ltr">
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={data.trend.map((t) => ({ ...t, label: formatJalaliFromISO(t.date).slice(5) }))} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fontFamily: 'Vazirmatn' }} interval={2} reversed />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={34} orientation="right" tickFormatter={(v: number) => toFa(v)} />
                  <Tooltip
                    contentStyle={{ direction: 'rtl', fontFamily: 'Vazirmatn', fontSize: 12, borderRadius: 12, border: '1px solid #e4e4e7' }}
                    labelFormatter={(label: string) => `${label}`}
                    formatter={(v: number) => [toFa(v), 'ثبت']}
                  />
                  <Line type="monotone" dataKey="count" stroke="#d97706" strokeWidth={2.5} dot={{ r: 2.5, fill: '#d97706' }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* نمودار وضعیت کارگاه‌ها */}
          {data.byWorkshop.length > 0 ? (
            <div className="px-4 mb-5">
              <h2 className="text-sm font-semibold mb-2.5">وضعیت به تفکیک کارگاه</h2>
              <div className="rounded-2xl border border-border bg-card p-3" dir="ltr">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.byWorkshop.map((w) => ({ name: w.workshopName, تأییدشده: w.approved, درانتظار: w.pending, ردشده: w.rejected }))} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: 'Vazirmatn' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={34} orientation="right" tickFormatter={(v: number) => toFa(v)} />
                    <Tooltip contentStyle={{ direction: 'rtl', fontFamily: 'Vazirmatn', fontSize: 12, borderRadius: 12, border: '1px solid #e4e4e7' }} formatter={(v: number) => toFa(v)} />
                    <Bar dataKey="تأییدشده" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="درانتظار" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ردشده" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {/* عملکرد سرپرستان */}
          {data.supervisorPerformance.length > 0 ? (
            <div className="px-4 mb-5">
              <h2 className="text-sm font-semibold mb-2.5">عملکرد سرپرستان (۳۰ روز)</h2>
              <div className="rounded-2xl border border-border bg-card divide-y divide-border/70 overflow-hidden">
                {data.supervisorPerformance.map((s) => (
                  <div key={s.supervisorId} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        تأیید {toFa(s.approved)} · رد {toFa(s.rejected)}
                        {s.avgApprovalMinutes !== null ? ` · میانگین تأیید ${toFa(s.avgApprovalMinutes)} دقیقه` : ''}
                      </p>
                    </div>
                    <span className="font-bold numeric-input shrink-0">{toFa(s.total)} ثبت</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* تفکیک نوع ورود */}
          <div className="px-4 mb-5">
            <h2 className="text-sm font-semibold mb-2.5">تفکیک نوع ورود</h2>
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
              {data.byType.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">هنوز داده‌ای نیست.</p>
              ) : (
                data.byType.map((t) => {
                  const max = Math.max(...data.byType.map((x) => x.count))
                  return (
                    <div key={t.type} className="flex items-center gap-3">
                      <span className="text-xs w-28 shrink-0 truncate">{ENTRY_TYPES[t.type as keyof typeof ENTRY_TYPES] ?? t.type}</span>
                      <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${(t.count / max) * 100}%` }} />
                      </div>
                      <span className="text-xs font-bold w-8 text-left numeric-input">{toFa(t.count)}</span>
                    </div>
                  )
                })
              )}
              <div className="flex gap-2 pt-1.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ArrowLeftRight className="size-3.5" />
                  انتقال: {toFa(data.transfers)}
                </span>
                <span className="flex items-center gap-1">
                  <HandCoins className="size-3.5" />
                  امانت: {toFa(data.loans)}
                </span>
              </div>
            </div>
          </div>

          {/* پروژه‌ها و تأمین‌کنندگان */}
          <div className="px-4 mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold flex items-center gap-1.5 mb-2.5">
                <Building2 className="size-3.5 text-accent" />
                بر اساس پروژه
              </h3>
              {data.byProject.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">داده‌ای نیست</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.byProject.slice(0, 5).map((p) => (
                    <li key={p.projectId} className="flex items-center justify-between text-xs">
                      <span className="truncate">{p.name}</span>
                      <span className="font-bold numeric-input">{toFa(p.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold mb-2.5">تأمین‌کنندگان برتر</h3>
              {data.suppliers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">داده‌ای نیست</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.suppliers.slice(0, 5).map((s) => (
                    <li key={s.name} className="flex items-center justify-between text-xs">
                      <span className="truncate">{s.name}</span>
                      <span className="font-bold numeric-input">{toFa(s.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* دسترسی‌های بیشتر */}
          <div className="px-4 pb-8 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => navigate('reports')}
              className="rounded-2xl border border-border bg-card p-4 text-right active:scale-[0.98] transition-transform"
            >
              <FileBarChart className="size-5 text-accent mb-2" />
              <span className="block text-sm font-medium">گزارش‌ها</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">گزارش تجمیعی مصالح</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('audit-logs')}
              className="rounded-2xl border border-border bg-card p-4 text-right active:scale-[0.98] transition-transform"
            >
              <Clock3 className="size-5 text-accent mb-2" />
              <span className="block text-sm font-medium">حسابرسی</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">تمام عملیات ثبت‌شده</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

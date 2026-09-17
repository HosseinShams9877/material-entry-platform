"use client"

import { useEffect, useState } from 'react'
import { PenLine, ChevronLeft, Wrench, ListTodo, FileBarChart2, ClipboardList, ShoppingCart, FileSignature, Package } from 'lucide-react'
import { api, type DashboardSupervisor, type DailyTaskListItem } from '@/lib/client'
import { useApp } from '@/store/app'
import { StatCard, ListSkeleton, StatusBadge, TypeBadge } from '@/components/app/shared'
import { useRole } from '@/store/app'
import { formatRelative, formatQty, toFa } from '@/lib/fa'
import { Button } from '@/components/ui/button'
import { ERROR_MSG } from '@/components/app/messages'

export default function SupervisorHome() {
  const [data, setData] = useState<DashboardSupervisor | null>(null)
  const [error, setError] = useState('')
  const [todayTasks, setTodayTasks] = useState<DailyTaskListItem[] | null>(null)
  const navigate = useApp((s) => s.navigate)
  const session = useApp((s) => s.session)
  const role = useRole()

  useEffect(() => {
    api
      .get<DashboardSupervisor>('/api/v1/dashboard')
      .then(setData)
      .catch(() => setError(ERROR_MSG))
    api
      .get<{ tasks: DailyTaskListItem[] }>('/api/v1/daily-tasks?mine=1&pageSize=3')
      .then((d) => setTodayTasks(d.tasks))
      .catch(() => setTodayTasks([]))
  }, [])

  async function load() {
    setError('')
    try {
      setData(await api.get<DashboardSupervisor>('/api/v1/dashboard'))
    } catch {
      setError(ERROR_MSG)
    }
  }

  const canCreateEntry = !!role && ['SUPER_ADMIN', 'ADMIN', 'WORKSHOP_SUPERVISOR', 'WORKSHOP_MANAGER'].includes(role)
  const canDailyModule = !!role && ['SUPER_ADMIN', 'ADMIN', 'WORKSHOP_SUPERVISOR', 'WORKSHOP_MANAGER', 'INSPECTOR'].includes(role)
  const isFieldWorker = role === 'FIELD_WORKER'
  const permissions = session?.permissions ?? []
  const canWorkReport = permissions.includes('workreport.create')
  const canPurchaseCreate = permissions.includes('purchase.create')
  const canStatementCreate = permissions.includes('statement.create')
  const canInventory = permissions.includes('inventory.view')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'صبح بخیر' : hour < 18 ? 'وقت بخیر' : 'شب بخیر'

  return (
    <div className="max-w-lg mx-auto">
      {/* هدر */}
      <div className="safe-top bg-zinc-900 text-white px-5 pt-6 pb-14 rounded-b-3xl -mb-10">
        <p className="text-xs text-zinc-400">{greeting} 👋</p>
        <h1 className="text-lg font-bold mt-0.5">{session?.user.fullName}</h1>
        <p className="text-xs text-zinc-400 mt-1">
          {session?.workshops[0]?.name ?? 'کارگاه شما'}
        </p>
      </div>

      {/* CTAهای بزرگ — فقط برای نقش‌های ثبت‌کننده */}
      {canCreateEntry ? (
      <div className="px-4 grid grid-cols-2 gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate('manual-entry')}
          className="rounded-2xl bg-amber-500 text-zinc-900 p-5 text-right min-h-32 flex flex-col justify-between active:scale-[0.98] transition-transform shadow-md shadow-amber-500/20 col-span-2"
        >
          <PenLine className="size-8" strokeWidth={2.2} />
          <span>
            <span className="block font-bold text-lg">ثبت ورود مصالح</span>
            <span className="block text-[11px] text-amber-900 mt-0.5">فرم کوتاه و ساده — با تقویم شمسی</span>
          </span>
        </button>
      </div>
      ) : null}

      {/* نیروی اجرایی — خوداظهاری گزارش کار (ساده‌ترین مسیر ممکن) */}
      {isFieldWorker ? (
      <div className="px-4 mb-6">
        <button
          type="button"
          onClick={() => navigate('work-report-form')}
          className="w-full rounded-2xl bg-amber-500 text-zinc-900 p-5 text-right min-h-28 flex flex-col justify-between active:scale-[0.98] transition-transform shadow-md shadow-amber-500/20"
        >
          <ClipboardList className="size-8" strokeWidth={2.2} />
          <span>
            <span className="block font-bold text-lg">اعلام گزارش کار امروز</span>
            <span className="block text-[11px] text-amber-900 mt-0.5">کارِ امروز خودتان را بنویسید</span>
          </span>
        </button>
      </div>
      ) : null}

      {/* ماژول‌های عملیاتی: گزارش کار، اعلام نیاز، صورت وضعیت */}
      {canWorkReport || canPurchaseCreate || canStatementCreate ? (
      <div className="px-4 mb-6">
        <div className="grid grid-cols-3 gap-2.5">
          {canWorkReport ? (
            <button
              type="button"
              onClick={() => navigate('work-report-form')}
              className="rounded-2xl border border-border bg-card p-3.5 text-right flex flex-col gap-2 active:scale-[0.98] transition-transform"
            >
              <ClipboardList className="size-6 text-accent" strokeWidth={2.2} />
              <span>
                <span className="block font-bold text-[13px]">گزارش کار</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">کارِ کارگران امروز</span>
              </span>
            </button>
          ) : null}
          {canPurchaseCreate ? (
            <button
              type="button"
              onClick={() => navigate('purchase-form')}
              className="rounded-2xl border border-border bg-card p-3.5 text-right flex flex-col gap-2 active:scale-[0.98] transition-transform"
            >
              <ShoppingCart className="size-6 text-accent" strokeWidth={2.2} />
              <span>
                <span className="block font-bold text-[13px]">اعلام نیاز</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">درخواست خرید مصالح</span>
              </span>
            </button>
          ) : null}
          {canStatementCreate ? (
            <button
              type="button"
              onClick={() => navigate('statement-form')}
              className="rounded-2xl border border-border bg-card p-3.5 text-right flex flex-col gap-2 active:scale-[0.98] transition-transform"
            >
              <FileSignature className="size-6 text-accent" strokeWidth={2.2} />
              <span>
                <span className="block font-bold text-[13px]">صورت وضعیت</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">با امضای مدیر کل</span>
              </span>
            </button>
          ) : null}
          {canInventory && !canWorkReport ? (
            <button
              type="button"
              onClick={() => navigate('inventory')}
              className="rounded-2xl border border-border bg-card p-3.5 text-right flex flex-col gap-2 active:scale-[0.98] transition-transform"
            >
              <Package className="size-6 text-accent" strokeWidth={2.2} />
              <span>
                <span className="block font-bold text-[13px]">انبار</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">موجودی و گردش مصالح</span>
              </span>
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-2.5">
          {canWorkReport ? (
            <button
              type="button"
              onClick={() => navigate('work-reports')}
              className="rounded-xl border border-border bg-card/70 px-3 py-2 text-right text-xs font-medium active:scale-[0.99] transition-transform"
            >
              مشاهدهٔ گزارش‌های کار
              <ChevronLeft className="size-3.5 inline mr-1 -mt-0.5" />
            </button>
          ) : null}
          {canPurchaseCreate ? (
            <button
              type="button"
              onClick={() => navigate('purchase-requests')}
              className="rounded-xl border border-border bg-card/70 px-3 py-2 text-right text-xs font-medium active:scale-[0.99] transition-transform"
            >
              درخواست‌های خرید
              <ChevronLeft className="size-3.5 inline mr-1 -mt-0.5" />
            </button>
          ) : null}
          {canInventory && (canWorkReport || canPurchaseCreate) ? (
            <button
              type="button"
              onClick={() => navigate('inventory')}
              className="rounded-xl border border-border bg-card/70 px-3 py-2 text-right text-xs font-medium active:scale-[0.99] transition-transform"
            >
              موجودی انبار
              <ChevronLeft className="size-3.5 inline mr-1 -mt-0.5" />
            </button>
          ) : null}
        </div>
      </div>
      ) : null}

      {/* ماژول روزانه: وظایف + گزارش — فقط نقش‌های مجاز */}
      {canDailyModule ? (
      <div className="px-4 mb-6">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button
            type="button"
            onClick={() => navigate('daily-tasks')}
            className="rounded-2xl border border-border bg-card p-4 text-right flex flex-col gap-2 active:scale-[0.98] transition-transform"
          >
            <span className="flex items-center justify-between">
              <ListTodo className="size-6 text-accent" strokeWidth={2.2} />
              {todayTasks && todayTasks.length > 0 ? (
                <span className="rounded-full bg-accent text-accent-foreground text-[10px] font-bold px-2 py-0.5">
                  {toFa(todayTasks.length)} فعال
                </span>
              ) : null}
            </span>
            <span>
              <span className="block font-bold text-sm">وظایف روزانه</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">دستور مدیر و تیک انجام</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate('daily-report-form')}
            className="rounded-2xl border border-border bg-card p-4 text-right flex flex-col gap-2 active:scale-[0.98] transition-transform"
          >
            <FileBarChart2 className="size-6 text-accent" strokeWidth={2.2} />
            <span>
              <span className="block font-bold text-sm">گزارش روزانه</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">گزارش امروز کارگاه برای مدیر</span>
            </span>
          </button>
        </div>
        {todayTasks && todayTasks.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">وظایف شما</h2>
            {todayTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate('daily-task-detail', { id: t.id })}
                className="w-full rounded-xl border border-border bg-card p-3 text-right active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <span className="text-[11px] text-muted-foreground shrink-0">{toFa(t.progress)}٪</span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      ) : null}

      {/* وضعیت امروز */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-semibold">امروز</h2>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8" onClick={() => navigate('entry-history')}>
            همه ثبت‌ها
            <ChevronLeft className="size-4" />
          </Button>
        </div>
        {error ? (
          <button onClick={load} className="w-full rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm p-4 text-right">
            {ERROR_MSG} — برای تلاش دوباره لمس کنید
          </button>
        ) : !data ? (
          <ListSkeleton rows={1} />
        ) : (
          <div className="flex gap-2">
            <StatCard label="ثبت امروز" value={toFa(data.today?.total ?? 0)} dotColor="bg-blue-600" onClick={() => navigate('entry-history')} />
            <StatCard label="تأیید شده" value={toFa(data.today?.approved ?? 0)} dotColor="bg-green-600" onClick={() => navigate('entry-history')} />
            <StatCard label="در انتظار" value={toFa(data.pending ?? 0)} dotColor="bg-yellow-500" onClick={() => navigate('entry-history')} />
            <StatCard label="نیازمند اصلاح" value={toFa(data.correction ?? 0)} dotColor="bg-orange-500" onClick={() => navigate('entry-history')} />
          </div>
        )}
      </div>

      {/* آخرین ثبت‌ها */}
      <div className="px-4 pb-6">
        <h2 className="text-sm font-semibold mb-2.5">آخرین ثبت‌ها</h2>
        {error ? null : !data ? (
          <ListSkeleton rows={3} />
        ) : (data.recent ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
            <Wrench className="size-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">هنوز هیچ ثبت ورودی انجام نشده است.</p>
            <p className="text-xs text-muted-foreground mt-1">با دکمه‌های بالا اولین ثبت را انجام دهید.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {(data.recent ?? []).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => navigate('entry-detail', { id: e.id })}
                className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <StatusBadge status={e.status} size="sm" />
                  <span className="text-[11px] text-muted-foreground">
                    شماره {toFa(e.entryNumber)} · {formatRelative(e.createdAt)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">
                  {e.firstItem ? `${e.firstItem.materialName} — ${formatQty(e.firstItem.quantity)} ${e.firstItem.unit}` : 'بدون قلم'}
                  {e.itemsCount > 1 ? ` + ${toFa(e.itemsCount - 1)} قلم دیگر` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <TypeBadge type={e.type} />
                  {e.projects.slice(0, 2).map((p) => (
                    <span key={p} className="text-[11px] text-muted-foreground">
                      {p}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

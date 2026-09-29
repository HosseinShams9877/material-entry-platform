"use client"

import { useEffect, useState } from 'react'
import { ClipboardList, ListTodo, ChevronLeft, FileSignature } from 'lucide-react'
import { api, type DailyTaskListItem } from '@/lib/client'
import { useApp } from '@/store/app'
import { ListSkeleton, TaskStatusBadge, EmptyState } from '@/components/app/shared'
import { ROLES } from '@/lib/permissions'

/**
 * خانهٔ اختصاصی کارگر — ساده و متمرکز:
 * فقط اعلام گزارش کارِ خودش، وظایفِ خودش و اعلان‌ها.
 * هیچ آمار ثبت ورود، فهرست ثبت‌ها یا دادهٔ غیرمرتبطی اینجا نشان داده نمی‌شود.
 */
export default function WorkerHome() {
  const [tasks, setTasks] = useState<DailyTaskListItem[] | null>(null)
  const [taskError, setTaskError] = useState(false)
  const navigate = useApp((s) => s.navigate)
  const session = useApp((s) => s.session)

  useEffect(() => {
    api
      .get<{ tasks: DailyTaskListItem[] }>('/api/v1/daily-tasks?mine=1&pageSize=5')
      .then((d) => setTasks(d.tasks))
      .catch(() => setTaskError(true))
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'صبح بخیر' : hour < 18 ? 'وقت بخیر' : 'شب بخیر'

  return (
    <div className="max-w-lg mx-auto">
      {/* هدر */}
      <div className="safe-top bg-zinc-900 text-white px-5 pt-6 pb-14 rounded-b-3xl -mb-10">
        <p className="text-xs text-zinc-400">{greeting} 👋</p>
        <h1 className="text-lg font-bold mt-0.5">{session?.user.fullName}</h1>
        <p className="text-xs text-zinc-400 mt-1">
          {session?.workshops[0]?.name ?? 'کارگاه شما'} · {ROLES[session?.user.role as keyof typeof ROLES] ?? 'کارگر'}
        </p>
      </div>

      {/* اعلام گزارش کار — تنها کارِ اصلی کارگر در این نرم‌افزار */}
      <div className="px-4 mb-6">
        <button
          type="button"
          onClick={() => navigate('work-report-form')}
          className="w-full rounded-2xl bg-amber-500 text-zinc-900 p-5 text-right min-h-32 flex flex-col justify-between active:scale-[0.98] transition-transform shadow-md shadow-amber-500/20"
        >
          <ClipboardList className="size-8" strokeWidth={2.2} />
          <span>
            <span className="block font-bold text-lg">اعلام گزارش کار امروز</span>
            <span className="block text-[11px] text-amber-900 mt-0.5">کاری که امروز انجام دادید را بنویسید</span>
          </span>
        </button>
      </div>

      {/* وظایف من — فقط وظایفی که خودش مسئولش است */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <ListTodo className="size-4" />
            وظایف من
          </h2>
          <button
            type="button"
            onClick={() => navigate('daily-tasks')}
            className="text-xs text-muted-foreground h-8 px-2"
          >
            همه
            <ChevronLeft className="size-4 inline" />
          </button>
        </div>
        {taskError ? (
          <EmptyState title="وظایف بارگذاری نشد" hint="اتصال اینترنت را بررسی کنید." />
        ) : !tasks ? (
          <ListSkeleton rows={2} />
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
            <p className="text-sm font-medium">فعلاً وظیفه‌ای برای شما نداریم.</p>
            <p className="text-xs text-muted-foreground mt-1">وقتی سرپرست وظیفه‌ای به شما بدهد، اینجا دیده می‌شود.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate('daily-task-detail', { id: t.id })}
                className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <TaskStatusBadge status={t.status} size="sm" />
                  <span className="text-[11px] text-muted-foreground shrink-0">{t.projectName}</span>
                </div>
                <p className="text-sm font-medium truncate">{t.title}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* گزارش‌های قبلی خودش */}
      <div className="px-4 pb-6">
        <button
          type="button"
          onClick={() => navigate('work-reports')}
          className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-right text-sm font-medium flex items-center justify-between active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center gap-2">
            <FileSignature className="size-4 text-accent" />
            گزارش‌های کار من
          </span>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

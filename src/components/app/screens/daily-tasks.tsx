"use client"

import { useCallback, useEffect, useState } from 'react'
import { Plus, ChevronLeft, CalendarDays, AlarmClock, ListTodo } from 'lucide-react'
import { api, type DailyTaskListItem } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, TaskStatusBadge, PriorityBadge } from '@/components/app/shared'
import { TaskProgress } from '@/components/app/daily-shared'
import { Button } from '@/components/ui/button'
import { formatJalaliDateTime, formatJalaliTehran, toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

const FILTERS = [
  { key: '', label: 'همه' },
  { key: 'PENDING,IN_PROGRESS', label: 'فعال' },
  { key: 'COMPLETED', label: 'انجام‌شده' },
  { key: 'DRAFT', label: 'پیش‌نویس' },
  { key: 'CANCELLED', label: 'لغوشده' },
] as const

export default function DailyTasks() {
  const [tasks, setTasks] = useState<DailyTaskListItem[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const navigate = useApp((s) => s.navigate)
  const role = useApp((s) => s.session?.user.role)
  const canCreate = role === 'WORKSHOP_MANAGER' || role === 'SUPER_ADMIN' || role === 'ADMIN'

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pageSize: '30' })
      if (filter) params.set('status', filter)
      if (overdueOnly) params.set('overdue', '1')
      const res = await api.get<{ tasks: DailyTaskListItem[] }>(`/api/v1/daily-tasks?${params.toString()}`)
      setTasks(res.tasks)
      setError('')
    } catch {
      setError(ERROR_MSG)
    }
  }, [filter, overdueOnly])

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams({ pageSize: '30' })
    if (filter) params.set('status', filter)
    if (overdueOnly) params.set('overdue', '1')
    api
      .get<{ tasks: DailyTaskListItem[] }>(`/api/v1/daily-tasks?${params.toString()}`)
      .then((res) => {
        if (!alive) return
        setTasks(res.tasks)
        setError('')
      })
      .catch(() => {
        if (alive) setError(ERROR_MSG)
      })
    return () => {
      alive = false
    }
  }, [filter, overdueOnly])

  return (
    <div className="max-w-lg mx-auto">
      <ScreenHeader
        title="وظایف روزانه"
        subtitle="وظایف ارسالی مدیر و وضعیت انجام"
        right={
          canCreate ? (
            <Button size="sm" className="h-9 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => navigate('daily-task-form')}>
              <Plus className="size-4" />
              وظیفه جدید
            </Button>
          ) : undefined
        }
      />

      {/* فیلترها */}
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
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
            overdueOnly ? 'bg-red-500 text-white border-red-500' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          <AlarmClock className="size-3.5" />
          دارای تأخیر
        </button>
      </div>

      <div className="px-4 pb-6">
        {error ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : !tasks ? (
          <ListSkeleton rows={4} />
        ) : tasks.length === 0 ? (
          <EmptyState
            title="وظیفه‌ای یافت نشد"
            hint={canCreate ? 'با دکمهٔ «وظیفه جدید» اولین وظیفه را ایجاد کنید.' : 'وظیفه‌ای برای شما ارسال نشده است.'}
            icon={<ListTodo className="size-7" />}
          />
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TaskStatusBadge status={t.status} size="sm" />
                    {t.isOverdue ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 text-[11px] font-medium">
                        <AlarmClock className="size-3" />
                        تأخیر
                      </span>
                    ) : null}
                  </div>
                  <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
                </div>
                <p className="text-sm font-medium leading-6">{t.title}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {formatJalaliTehran(t.assignedDate)}
                  </span>
                  {t.dueDate ? <span>· مهلت: {formatJalaliDateTime(t.dueDate)}</span> : null}
                  <span>· {t.projectName}</span>
                </div>
                <div className="mt-2.5">
                  <TaskProgress value={t.progress} />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PriorityBadge priority={t.priority} />
                    {t.assignees.length > 0 ? (
                      <span className="text-[11px] text-muted-foreground truncate max-w-40">
                        ← {t.assignees.map((a) => a.fullName).join('، ')}
                      </span>
                    ) : null}
                  </div>
                  {t.itemsCount > 0 ? (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {toFa(t.completedItemsCount)} از {toFa(t.itemsCount)}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

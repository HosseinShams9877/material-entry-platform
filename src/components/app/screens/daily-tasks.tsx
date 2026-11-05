"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ChevronLeft, CalendarDays, AlarmClock, ListTodo, SlidersHorizontal, X, Search } from 'lucide-react'
import { api, type DailyTaskListItem, type MasterDataWithSupervisors } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, TaskStatusBadge, PriorityBadge, SelectionSheet } from '@/components/app/shared'
import { TaskProgress } from '@/components/app/daily-shared'
import { Button } from '@/components/ui/button'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { formatJalaliDateTime, formatJalaliTehran, toFa } from '@/lib/fa'
import { ROLES } from '@/lib/permissions'
import { ERROR_MSG } from '@/components/app/messages'

const FILTERS = [
  { key: '', label: 'همه' },
  { key: 'PENDING,IN_PROGRESS', label: 'فعال' },
  { key: 'COMPLETED', label: 'انجام‌شده' },
  { key: 'DRAFT', label: 'پیش‌نویس' },
  { key: 'CANCELLED', label: 'لغوشده' },
] as const

type SheetKind = 'workshop' | 'project' | 'assignee' | 'from' | 'to' | null

// ─────────────────────────── فهرست وظایف روزانه + فیلتر (الگوی گزارش‌های روزانه — Item ۱0—a) ───────────────────────────
// فیلترها: کارگاه، پروژه، گیرنده (فقط برای دارای مجوز task.assign)، بازهٔ تاریخ (شمسی)، جستجوی آزاد

export default function DailyTasks() {
  const [tasks, setTasks] = useState<DailyTaskListItem[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const navigate = useApp((s) => s.navigate)
  const role = useApp((s) => s.session?.user.role)
  const perms = useApp((s) => s.session?.permissions) ?? []
  const canCreate = role === 'PROJECT_MANAGER'
  // فیلتر گیرنده فقط برای کسانی که مجوز ارسال وظیفه دارند (سرور هم همین‌گونه محدود می‌کند)
  const canFilterAssignee = perms.includes('task.assign')

  // فیلترها
  const [md, setMd] = useState<MasterDataWithSupervisors | null>(null)
  const [workshopId, setWorkshopId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  useEffect(() => {
    api.get<MasterDataWithSupervisors>('/api/v1/master').then(setMd).catch(() => undefined)
  }, [])

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '30' })
    if (filter) params.set('status', filter)
    if (workshopId) params.set('workshopId', workshopId)
    if (projectId) params.set('projectId', projectId)
    if (assigneeId && canFilterAssignee) params.set('assigneeId', assigneeId)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (overdueOnly) params.set('overdue', '1')
    if (appliedQuery) params.set('q', appliedQuery)
    return params
  }, [filter, workshopId, projectId, assigneeId, fromDate, toDate, appliedQuery, canFilterAssignee, overdueOnly])

  const queryString = buildParams().toString()

  useEffect(() => {
    let alive = true
    api
      .get<{ tasks: DailyTaskListItem[] }>(`/api/v1/daily-tasks?${queryString}`)
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
  }, [queryString])

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ tasks: DailyTaskListItem[] }>(`/api/v1/daily-tasks?${queryString}`)
      setTasks(res.tasks)
      setError('')
    } catch {
      setError(ERROR_MSG)
    }
  }, [queryString])

  const activeFilterCount = [workshopId, projectId, canFilterAssignee ? assigneeId : '', fromDate, toDate].filter(Boolean).length

  // گیرنده‌های ممکن — Item ۵—b: همهٔ کسانی که به کارگاه/پروژهٔ انتخاب‌شده دسترسی دارند (نه فقط کارگاه اصلی)
  const assigneeOptions = useMemo(() => {
    const list = md?.supervisors ?? []
    if (!workshopId && !projectId) return list.map((u) => ({ id: u.id, label: u.fullName, hint: ROLES[u.role as keyof typeof ROLES] ?? undefined }))
    return list
      .filter(
        (u) =>
          (workshopId ? u.userWorkshops.some((w) => w.workshopId === workshopId) : true) &&
          (projectId ? u.userProjects.some((p) => p.projectId === projectId) : true)
      )
      .map((u) => ({ id: u.id, label: u.fullName, hint: ROLES[u.role as keyof typeof ROLES] ?? undefined }))
  }, [md, workshopId, projectId])

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
    setAssigneeId('')
    setFromDate('')
    setToDate('')
  }

  function search() {
    setAppliedQuery(query.trim())
  }

  return (
    <div className="max-w-lg mx-auto">
      <ScreenHeader
        title="وظایف روزانه"
        subtitle="وظایف ارسالی مدیر و وضعیت انجام"
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
              <Button size="sm" className="h-9 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => navigate('daily-task-form')}>
                <Plus className="size-4" />
                وظیفه جدید
              </Button>
            ) : null}
          </div>
        }
      />

      {/* جستجوی آزاد */}
      <div className="px-4 pt-3 relative">
        <Search className="size-4 absolute right-7 top-1/2 -translate-y-1/2 mt-1.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="جستجو در عنوان وظیفه…"
          className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 pl-10 text-sm outline-none"
          inputMode="search"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setAppliedQuery('')
            }}
            className="absolute left-7 top-1/2 -translate-y-1/2 mt-1.5"
            aria-label="پاک کردن"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      {/* فیلتر وضعیت + تأخیر */}
      <div className="px-4 pt-2.5 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
            overdueOnly ? 'bg-red-500 text-white border-red-500' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          <AlarmClock className="size-3.5" />
          دارای تأخیر
        </button>
      </div>

      {/* پنل فیلترها — الگوی گزارش‌های روزانه */}
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
            {canFilterAssignee ? (
              <button
                type="button"
                onClick={() => setSheet('assignee')}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-right min-h-11"
              >
                <span className="block text-[10px] text-muted-foreground">گیرنده</span>
                <span className="block text-xs font-medium truncate">
                  {(md?.supervisors ?? []).find((u) => u.id === assigneeId)?.fullName ?? 'همه'}
                </span>
              </button>
            ) : null}
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
        ) : !tasks ? (
          <ListSkeleton rows={4} />
        ) : tasks.length === 0 ? (
          <EmptyState
            title="وظیفه‌ای یافت نشد"
            hint={activeFilterCount > 0 || appliedQuery ? 'با این فیلترها وظیفه‌ای پیدا نشد — فیلترها را تغییر دهید.' : canCreate ? 'با دکمهٔ «وظیفه جدید» اولین وظیفه را ایجاد کنید.' : 'وظیفه‌ای برای شما ارسال نشده است.'}
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
                  {/* Item ۱0—b: درصد نمایش‌داده‌شده میانگینِ پیشرفت همهٔ گیرنده‌هاست (Item ۸) */}
                  {t.assignees.length > 1 ? (
                    <p className="text-[10px] text-muted-foreground mt-1">میانگین پیشرفت {toFa(t.assignees.length)} گیرنده</p>
                  ) : null}
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
        open={sheet === 'assignee'}
        onOpenChange={(v) => setSheet(v ? 'assignee' : null)}
        title="فیلتر گیرنده"
        options={assigneeOptions}
        selected={assigneeId ? [assigneeId] : []}
        onConfirm={(ids) => setAssigneeId(ids[0] ?? '')}
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

"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X, CalendarDays } from 'lucide-react'
import { Drawer } from 'vaul'
import { api, type EntryListItem, type MasterDataWithSupervisors } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, StatusBadge, TypeBadge, DirectionBadge, ListSkeleton, EmptyState, ErrorState, SelectionSheet } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { formatRelative, formatQty, toFa, formatJalaliFromISO } from '@/lib/fa'
import { ENTRY_TYPES, entryTypeLabel } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { ERROR_MSG } from '@/components/app/messages'

const ALL = '__all__'

// وضعیت‌های پایهٔ صف تأیید — همیشه در تقاطع با فیلتر وضعیت کاربر (نیازمند ۴)
const QUEUE_STATUSES = ['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED'] as const

const STATUS_FILTERS = [
  { key: ALL, label: 'همه وضعیت‌ها' },
  { key: 'SUBMITTED', label: 'ارسال‌شده' },
  { key: 'PENDING_REVIEW', label: 'در انتظار بررسی' },
  { key: 'RESUBMITTED', label: 'ارسال مجدد' },
]

// فیلتر جهت — ورود / خروج / هر دو (نیازمند ۴)
const DIRECTION_FILTERS = [
  { key: ALL, label: 'ورود و خروج' },
  { key: 'IN', label: 'ورود' },
  { key: 'OUT', label: 'خروج' },
] as const

/** صف تأیید مدیر — فقط ثبت‌های در انتظار بررسی */
export default function PendingApprovals() {
  const [entries, setEntries] = useState<EntryListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const navigate = useApp((s) => s.navigate)
  const session = useApp((s) => s.session)

  // فیلترهای اختصاصی این صفحه — همگی Scope-aware (نیازمند ۴)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>(ALL)
  const [direction, setDirection] = useState<string>(ALL)
  const [type, setType] = useState<string>(ALL)
  const [projectId, setProjectId] = useState<string>(ALL)
  const [workshopId, setWorkshopId] = useState<string>(ALL)
  const [supervisorId, setSupervisorId] = useState<string>(ALL)
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  const [dateSheet, setDateSheet] = useState<null | 'from' | 'to'>(null)
  const [sheet, setSheet] = useState<null | 'project' | 'workshop' | 'supervisor'>(null)
  const [master, setMaster] = useState<MasterDataWithSupervisors | null>(null)

  // گزینه‌های فیلتر از Master Data — فقط کارگاه‌ها/پروژه‌ها/افراد قابل‌دسترسی کاربر (کنترل دسترسی)
  useEffect(() => {
    api
      .get<MasterDataWithSupervisors>('/api/v1/master')
      .then(setMaster)
      .catch(() => undefined)
  }, [])

  const workshops = useMemo(() => {
    if (!master) return []
    const scopeWorkshopIds = session?.scope.workshopIds
    if (session?.scope.isGlobal || !scopeWorkshopIds) return master.workshops
    return master.workshops.filter((w) => scopeWorkshopIds.includes(w.id))
  }, [master, session])

  const projects = useMemo(() => {
    if (!master) return []
    const scopeProjectIds = session?.scope.projectIds
    if (session?.scope.isGlobal || !scopeProjectIds) return master.projects
    return master.projects.filter((p) => scopeProjectIds.includes(p.id))
  }, [master, session])

  // ثبت‌کنندگانِ دارای حساب کاربری — سرپرستان و انباردارانِ در دسترس (Scope-aware)
  const people = useMemo(() => {
    if (!master) return []
    const scopeWorkshopIds = session?.scope.workshopIds
    if (session?.scope.isGlobal || !scopeWorkshopIds) return master.supervisors
    const workshopIds = new Set(scopeWorkshopIds)
    return master.supervisors.filter((s) => !s.workshopId || workshopIds.has(s.workshopId))
  }, [master, session])

  const load = useCallback(
    async (q: string, st: string, dr: string, ty: string, pId: string, wsId: string, supId: string, f: string | null, t: string | null) => {
      setLoading(true)
      setError(false)
      try {
        // وضعیت‌های صف تأیید به‌صورت CSV — هر سه پایه، مگر اینکه کاربر یکی را انتخاب کند
        const statusParam = st === ALL ? QUEUE_STATUSES.join(',') : st
        const res = await api.get<{ entries: EntryListItem[] }>(
          `/api/v1/material-entries?pageSize=50&status=${statusParam}${dr !== ALL ? `&direction=${dr}` : ''}${
            ty !== ALL ? `&type=${ty}` : ''
          }${pId !== ALL ? `&projectId=${pId}` : ''}${wsId !== ALL ? `&workshopId=${wsId}` : ''}${
            supId !== ALL ? `&supervisorId=${supId}` : ''
          }${q ? `&q=${encodeURIComponent(q)}` : ''}${f ? `&from=${f}` : ''}${t ? `&to=${t}` : ''}`
        )
        const all = [...res.entries]
        all.sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
        setEntries(all)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(query, status, direction, type, projectId, workshopId, supervisorId, from, to)
  }, [load, status, direction, type, projectId, workshopId, supervisorId, from, to])

  const search = () => {
    void load(query, status, direction, type, projectId, workshopId, supervisorId, from, to)
  }

  const clearDateFilter = () => {
    setFrom(null)
    setTo(null)
    setDateFilterOpen(false)
    void load(query, status, direction, type, projectId, workshopId, supervisorId, null, null)
  }

  const hasDateFilter = !!from || !!to
  const projectName = projects.find((p) => p.id === projectId)?.name
  const workshopName = workshops.find((w) => w.id === workshopId)?.name
  const supervisorName = people.find((p) => p.id === supervisorId)?.fullName

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="تأییدات در انتظار" subtitle="ثبت‌هایی که منتظر بررسی شما هستند" />
      <div className="safe-top" />

      {/* جستجوی آزاد (نیازمند ۴—h) */}
      <div className="px-4 pt-3 relative">
        <Search className="size-4 absolute right-7 top-1/2 -translate-y-1/2 mt-1.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="جستجو در مصالح، مبدأ، سرپرست…"
          className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 pl-10 text-sm outline-none"
          inputMode="search"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              void load('', status, direction, type, projectId, workshopId, supervisorId, from, to)
            }}
            className="absolute left-7 top-1/2 -translate-y-1/2 mt-1.5"
            aria-label="پاک کردن"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      {/* فیلتر جهت + تاریخ (نیازمند ۴—b , a) */}
      <div className="px-4 pt-2.5 flex gap-2 overflow-x-auto no-scrollbar">
        {DIRECTION_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setDirection(f.key)
              void load(query, status, f.key, type, projectId, workshopId, supervisorId, from, to)
            }}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
              direction === f.key ? 'bg-amber-500 text-zinc-900 border-amber-500' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDateFilterOpen(true)}
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

      {/* فیلتر وضعیت + نوع + پروژه + کارگاه + ثبت‌کننده (نیازمند ۴—c , d , e , f , g) */}
      <div className="px-4 pt-2.5 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setStatus(f.key)
              void load(query, f.key, direction, type, projectId, workshopId, supervisorId, from, to)
            }}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
              status === f.key ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
        {/* برچسب نوع جهت‌دار — در خروج، «خرید» به «فروش» نمایش داده می‌شود (نیازمند ۳ + ۴—c) */}
        {Object.entries(ENTRY_TYPES).map(([key]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setType(key)
              void load(query, status, direction, key, projectId, workshopId, supervisorId, from, to)
            }}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
              type === key ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {entryTypeLabel(key, direction !== ALL ? direction : null)}
          </button>
        ))}
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
          onClick={() => setSheet('workshop')}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
            workshopId !== ALL ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          {workshopName ?? 'کارگاه'}
        </button>
        <button
          type="button"
          onClick={() => setSheet('supervisor')}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
            supervisorId !== ALL ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          {supervisorName ?? 'ثبت‌کننده'}
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorState
            message={ERROR_MSG}
            onRetry={() => void load(query, status, direction, type, projectId, workshopId, supervisorId, from, to)}
          />
        ) : entries.length === 0 ? (
          <EmptyState title="صف بررسی خالی است" hint="هیچ ثبت ارسال‌شده‌ای با این فیلترها منتظر بررسی نیست." />
        ) : (
          <div className="space-y-2.5">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => navigate('entry-detail', { id: e.id })}
                className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <StatusBadge status={e.status} size="sm" />
                  <span className="text-[11px] text-muted-foreground">{formatRelative(e.submittedAt ?? e.createdAt)}</span>
                </div>
                <p className="text-sm font-medium truncate">
                  {e.items.length > 0 ? `${e.items[0].materialName} — ${formatQty(e.items[0].quantity)} ${e.items[0].unit}` : 'بدون قلم'}
                  {e.items.length > 1 ? ` + ${toFa(e.items.length - 1)} قلم` : ''}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-muted-foreground">
                  <DirectionBadge direction={e.direction} />
                  <TypeBadge type={e.type} direction={e.direction} />
                  <span>{e.supervisorName}</span>
                  {e.source ? <span>از {e.source}</span> : null}
                  {e.projects.map((p) => (
                    <span key={p.id}>{p.name}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* شیت فیلتر تاریخ */}
      <Drawer.Root open={dateFilterOpen} onOpenChange={setDateFilterOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <Drawer.Title className="font-semibold px-5 pt-3">فیلتر بازهٔ تاریخ</Drawer.Title>
            <p className="text-xs text-muted-foreground px-5 pb-3">تقویم شمسی — بازهٔ ثبت‌های در انتظار را انتخاب کنید</p>

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
              <Button
                className="flex-1"
                onClick={() => {
                  setDateFilterOpen(false)
                  void load(query, status, direction, type, projectId, workshopId, supervisorId, from, to)
                }}
              >
                اعمال فیلتر
              </Button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

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

      {/* شیت‌های انتخاب فیلتر — پروژه / کارگاه / ثبت‌کننده (همگی Scope-aware — نیازمند ۴) */}
      <SelectionSheet
        open={sheet === 'project'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس پروژه"
        selected={[]}
        options={[{ id: ALL, label: 'همه پروژه‌ها' }, ...projects.map((p) => ({ id: p.id, label: p.name, hint: p.code ? `کد ${p.code}` : undefined }))]}
        onConfirm={(ids) => setProjectId(ids[0] ?? ALL)}
      />
      <SelectionSheet
        open={sheet === 'workshop'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس کارگاه"
        selected={[]}
        options={[{ id: ALL, label: 'همه کارگاه‌ها' }, ...workshops.map((w) => ({ id: w.id, label: w.name, hint: w.code ? `کد ${w.code}` : undefined }))]}
        onConfirm={(ids) => setWorkshopId(ids[0] ?? ALL)}
      />
      <SelectionSheet
        open={sheet === 'supervisor'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس ثبت‌کننده"
        selected={[]}
        options={[{ id: ALL, label: 'همه ثبت‌کنندگان' }, ...people.map((p) => ({ id: p.id, label: p.fullName }))]}
        onConfirm={(ids) => setSupervisorId(ids[0] ?? ALL)}
      />
    </div>
  )
}

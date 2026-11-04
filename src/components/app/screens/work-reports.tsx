"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X, CalendarDays, ClipboardList } from 'lucide-react'
import { Drawer } from 'vaul'
import { api, type WorkReportListItem, type MasterDataWithSupervisors } from '@/lib/client'
import { WORKER_KINDS } from '@/lib/permissions'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, SelectionSheet } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { formatJalaliFromISO, formatJalaliTehran, toFa } from '@/lib/fa'
import { Button } from '@/components/ui/button'
import { ERROR_MSG } from '@/components/app/messages'
import { useApp } from '@/store/app'
import { useImageViewer } from '@/components/app/image-viewer'

const ALL = '__all__'

export default function WorkReports() {
  const [reports, setReports] = useState<WorkReportListItem[]>([])
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [dateSheet, setDateSheet] = useState<null | 'from' | 'to'>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [master, setMaster] = useState<MasterDataWithSupervisors | null>(null)
  const [sheet, setSheet] = useState<null | 'worker' | 'creator' | 'project' | 'workshop'>(null)
  // فیلترهای اختصاصی این صفحه — کارگر، ثبت‌کننده، پروژه و کارگاه (همگی Scope-aware)
  const [workerId, setWorkerId] = useState<string>(ALL)
  const [createdById, setCreatedById] = useState<string>(ALL)
  const [projectId, setProjectId] = useState<string>(ALL)
  const [workshopId, setWorkshopId] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const session = useApp((s) => s.session)
  const imageViewer = useImageViewer()

  // گزینه‌های فیلتر از Master Data — فقط کارگاه‌ها/پروژه‌ها/افراد قابل‌دسترسی کاربر
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

  // کارگران از Master Data — خودِ Master هم Scope-aware است (فیلتر کارگاهی در سمت سرور)
  const workers = useMemo(() => master?.workers ?? [], [master])

  const people = useMemo(() => {
    if (!master) return []
    // ثبت‌کنندگانِ دارای حساب کاربری — سرپرستان و انباردارانِ در دسترس (Scope-aware)
    const scopeWorkshopIds = session?.scope.workshopIds
    if (session?.scope.isGlobal || !scopeWorkshopIds) return master.supervisors
    const workshopIds = new Set(scopeWorkshopIds)
    return master.supervisors.filter((s) => !s.workshopId || workshopIds.has(s.workshopId))
  }, [master, session])

  const load = useCallback(
    async (p: number, q: string, f: string | null, t: string | null, wId: string, cId: string, pId: string, wsId: string) => {
      setLoading(true)
      setError(false)
      try {
        const res = await api.get<{ reports: WorkReportListItem[]; pagination: { totalPages: number } }>(
          `/api/v1/work-reports?page=${p}&pageSize=15${q ? `&q=${encodeURIComponent(q)}` : ''}${f ? `&from=${f}` : ''}${
            t ? `&to=${t}` : ''
          }${wId !== ALL ? `&workerId=${wId}` : ''}${cId !== ALL ? `&createdById=${cId}` : ''}${
            pId !== ALL ? `&projectId=${pId}` : ''
          }${wsId !== ALL ? `&workshopId=${wsId}` : ''}`
        )
        setReports(res.reports)
        setTotalPages(res.pagination.totalPages)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(page, query, from, to, workerId, createdById, projectId, workshopId)
  }, [page, from, to, workerId, createdById, projectId, workshopId, load])

  const search = () => {
    setPage(1)
    void load(1, query, from, to, workerId, createdById, projectId, workshopId)
  }

  const clearDateFilter = () => {
    setFrom(null)
    setTo(null)
    setFilterOpen(false)
    setPage(1)
    void load(1, query, null, null, workerId, createdById, projectId, workshopId)
  }

  const hasDateFilter = !!from || !!to
  const workerName = master?.workers.find((w) => w.id === workerId)?.fullName
  const creatorName = people.find((p) => p.id === createdById)?.fullName
  const projectName = projects.find((p) => p.id === projectId)?.name
  const workshopName = workshops.find((w) => w.id === workshopId)?.name

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="گزارش کار کارگران" subtitle="چه کسی، چه روزی، چه کاری کرده است" />
      <div className="safe-top" />

      <div className="px-4 pt-3 relative">
        <Search className="size-4 absolute right-7 top-1/2 -translate-y-1/2 mt-1.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="جستجو در نام کارگر یا شرح کار…"
          className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 pl-10 text-sm outline-none"
          inputMode="search"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setPage(1)
              void load(1, '', from, to, workerId, createdById, projectId, workshopId)
            }}
            className="absolute left-7 top-1/2 -translate-y-1/2 mt-1.5"
            aria-label="پاک کردن"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      <div className="px-4 pt-2.5 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setSheet('worker')}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
            workerId !== ALL ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          {workerName ?? 'کارگر'}
        </button>
        <button
          type="button"
          onClick={() => setSheet('creator')}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
            createdById !== ALL ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
          }`}
        >
          {creatorName ?? 'ثبت‌کننده'}
        </button>
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
          onClick={() => setFilterOpen(true)}
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

      {loading && reports.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : error && reports.length === 0 ? (
        <ErrorState message={ERROR_MSG} onRetry={() => void load(page, query, from, to, workerId, createdById, projectId, workshopId)} />
      ) : reports.length === 0 ? (
        <EmptyState title="گزارشی پیدا نشد" hint="هنوز گزارش کاری برای این فیلتر ثبت نشده است." />
      ) : (
        <div className="px-4 space-y-2.5 pb-8">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                  <ClipboardList className="size-4 text-accent" />
                  {r.workerName}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatJalaliTehran(r.reportDate)}
                </span>
              </div>
              <p className="text-sm leading-7 text-foreground/90">{r.content}</p>
              {r.photos.length > 0 ? (
                <div className="flex gap-2 mt-2.5 overflow-x-auto no-scrollbar">
                  {r.photos.map((ph, i) => (
                    <button
                      key={ph.id}
                      type="button"
                      onClick={() =>
                        imageViewer.open(
                          r.photos.map((x) => ({ id: x.id, url: x.url, mimeType: x.mimeType })),
                          i
                        )
                      }
                      className="shrink-0 rounded-lg border border-border overflow-hidden active:scale-[0.97] transition-transform"
                      aria-label={`عکس ${toFa(i + 1)} ${r.workerName}`}
                    >
                      <img
                        src={ph.url}
                        alt={`عکس کار ${r.workerName}`}
                        className="size-16 object-cover bg-secondary"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-muted-foreground">
                <span>{r.workshopName}</span>
                {r.projectName ? <span>· {r.projectName}</span> : null}
                {r.crewCount && r.crewCount > 0 ? <span>· گروه {toFa(r.crewCount)} نفره</span> : null}
                <span>· ثبت: {r.createdByName}</span>
                {r.canDelete ? (
                  <button
                    type="button"
                    className="mr-auto text-red-500 font-medium"
                    onClick={() => {
                      if (confirm('این گزارش کار حذف شود؟')) {
                        void api
                          .del(`/api/v1/work-reports/${r.id}`)
                          .then(() => load(1, query, from, to, workerId, createdById, projectId, workshopId))
                          .catch(() => undefined)
                      }
                    }}
                  >
                    حذف
                  </button>
                ) : null}
              </div>
            </div>
          ))}

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحه {toFa(page)} از {toFa(totalPages)}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                بعدی
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {/* شیت فیلتر تاریخ */}
      <Drawer.Root open={filterOpen} onOpenChange={setFilterOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <Drawer.Title className="font-semibold px-5 pt-3">فیلتر بازهٔ تاریخ</Drawer.Title>
            <p className="text-xs text-muted-foreground px-5 pb-3">تقویم شمسی — بازهٔ تاریخ کار را انتخاب کنید</p>

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
                  setFilterOpen(false)
                  setPage(1)
                  void load(1, query, from, to, workerId, createdById, projectId, workshopId)
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

      {/* شیت‌های انتخاب فیلتر — کارگر / ثبت‌کننده / پروژه / کارگاه (همگی Scope-aware) */}
      <SelectionSheet
        open={sheet === 'worker'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس کارگر"
        selected={[]}
        options={[{ id: ALL, label: 'همه کارگران' }, ...workers.map((w) => ({ id: w.id, label: w.fullName, hint: WORKER_KINDS[w.kind as keyof typeof WORKER_KINDS] ?? undefined }))]}
        onConfirm={(ids) => {
          setWorkerId(ids[0] ?? ALL)
          setPage(1)
        }}
      />
      <SelectionSheet
        open={sheet === 'creator'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس ثبت‌کننده"
        selected={[]}
        options={[{ id: ALL, label: 'همه ثبت‌کنندگان' }, ...people.map((p) => ({ id: p.id, label: p.fullName }))]}
        onConfirm={(ids) => {
          setCreatedById(ids[0] ?? ALL)
          setPage(1)
        }}
      />
      <SelectionSheet
        open={sheet === 'project'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس پروژه"
        selected={[]}
        options={[{ id: ALL, label: 'همه پروژه‌ها' }, ...projects.map((p) => ({ id: p.id, label: p.name, hint: p.code ? `کد ${p.code}` : undefined }))]}
        onConfirm={(ids) => {
          setProjectId(ids[0] ?? ALL)
          setPage(1)
        }}
      />
      <SelectionSheet
        open={sheet === 'workshop'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="فیلتر بر اساس کارگاه"
        selected={[]}
        options={[{ id: ALL, label: 'همه کارگاه‌ها' }, ...workshops.map((w) => ({ id: w.id, label: w.name, hint: w.code ? `کد ${w.code}` : undefined }))]}
        onConfirm={(ids) => {
          setWorkshopId(ids[0] ?? ALL)
          setPage(1)
        }}
      />

      {imageViewer.viewer}
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Power, Search, ArrowLeftRight, History, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { api, ClientApiError, type WorkerTransferItem } from '@/lib/client'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, SelectionSheet } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { useApp } from '@/store/app'
import { toFa, formatJalaliFromISO, formatJalaliTehran, todayISO } from '@/lib/fa'
import { WORKER_KINDS } from '@/lib/permissions'
import { ERROR_MSG } from '@/components/app/messages'
import { Drawer } from 'vaul'

// ─────────────────────────── کارگران و افراد — با جابجایی نیرو و سابقهٔ کامل ───────────────────────────

interface Worker {
  id: string
  fullName: string
  kind: string
  jobTitle: string | null
  phone: string | null
  workshopId: string | null
  isActive: boolean
}

interface WorkshopRef {
  id: string
  name: string
}

export default function AdminWorkers() {
  const back = useApp((s) => s.back)

  const [items, setItems] = useState<Worker[]>([])
  const [workshops, setWorkshops] = useState<WorkshopRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Worker | 'new' | null>(null)
  const [saving, setSaving] = useState(false)

  // جابجایی
  const [transferFor, setTransferFor] = useState<Worker | null>(null)
  const [toWorkshopId, setToWorkshopId] = useState('')
  const [transferDate, setTransferDate] = useState(todayISO())
  const [transferReason, setTransferReason] = useState('')
  const [transferSheet, setTransferSheet] = useState<'workshop' | 'date' | null>(null)
  const [transferring, setTransferring] = useState(false)

  // سابقه
  const [historyFor, setHistoryFor] = useState<Worker | null>(null)
  const [history, setHistory] = useState<WorkerTransferItem[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ workers: Worker[] }>('/api/v1/admin/workers')
      setItems(res.workers)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    api
      .get<{ workshops: WorkshopRef[] }>('/api/v1/admin/workshops')
      .then((r) => setWorkshops(r.workshops))
      .catch(() => undefined)
  }, [load])

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      if (editing === 'new') {
        await api.post('/api/v1/admin/workers', values)
        toast.success('فرد ایجاد شد.')
      } else if (editing) {
        await api.patch(`/api/v1/admin/workers/${editing.id}`, values)
        toast.success('فرد ویرایش شد.')
      }
      setEditing(null)
      await load()
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: Worker) {
    try {
      await api.patch(`/api/v1/admin/workers/${item.id}`, { isActive: !item.isActive })
      await load()
      toast.success('وضعیت تغییر کرد.')
    } catch {
      toast.error(ERROR_MSG)
    }
  }

  async function openHistory(worker: Worker) {
    setHistoryFor(worker)
    setHistory(null)
    setHistoryLoading(true)
    try {
      const res = await api.get<{ transfers: WorkerTransferItem[] }>(`/api/v1/admin/workers/transfers?workerId=${worker.id}`)
      setHistory(res.transfers)
    } catch {
      toast.error(ERROR_MSG)
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function submitTransfer() {
    if (!transferFor || !toWorkshopId) {
      toast.error('کارگاه مقصد را انتخاب کنید.')
      return
    }
    setTransferring(true)
    try {
      await api.post(`/api/v1/admin/workers/${transferFor.id}/transfer`, {
        toWorkshopId,
        transferredAt: transferDate,
        reason: transferReason.trim() || null,
      })
      toast.success('جابجایی نیرو ثبت شد.')
      setTransferFor(null)
      setTransferReason('')
      setToWorkshopId('')
      await load()
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    } finally {
      setTransferring(false)
    }
  }

  const filtered = query.trim()
    ? items.filter((it) => it.fullName.includes(query.trim()) || (it.phone ?? '').includes(query.trim()))
    : items

  const workshopName = (id: string | null) => workshops.find((w) => w.id === id)?.name ?? '—'

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="کارگران و افراد"
        onBack={back}
        right={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            جدید
          </Button>
        }
      />

      <div className="p-4">
        <div className="relative mb-3">
          <Search className="size-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی فرد…"
            className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 text-sm outline-none"
          />
        </div>

        {loading && items.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : error && items.length === 0 ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="فردی ثبت نشده است" hint="با دکمه «جدید» اولین مورد را اضافه کنید." />
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.fullName}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {WORKER_KINDS[item.kind as keyof typeof WORKER_KINDS] ?? item.kind}
                      {item.jobTitle ? ` · ${item.jobTitle}` : ''}
                      {item.workshopId ? ` · ${workshopName(item.workshopId)}` : ''}
                      {item.phone ? ` · ${toFa(item.phone)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTransferFor(item)
                      setToWorkshopId('')
                      setTransferDate(todayISO())
                      setTransferReason('')
                    }}
                    className="size-10 rounded-lg flex items-center justify-center text-accent hover:bg-secondary shrink-0"
                    aria-label="جابجایی"
                  >
                    <ArrowLeftRight className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void openHistory(item)}
                    className="size-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary shrink-0"
                    aria-label="سابقهٔ جابجایی"
                  >
                    <History className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="size-10 rounded-lg flex items-center justify-center text-accent hover:bg-secondary shrink-0"
                    aria-label="ویرایش"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(item)}
                    className="size-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary shrink-0"
                    aria-label="فعال/غیرفعال"
                  >
                    <Power className="size-4" />
                  </button>
                </div>
              </div>
            ))}
            <p className="text-center text-[10px] text-muted-foreground pt-2">{toFa(items.length)} فرد</p>
          </div>
        )}
      </div>

      {/* فرم ایجاد/ویرایش */}
      {editing ? (
        <WorkerForm
          worker={editing === 'new' ? null : editing}
          workshops={workshops}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}

      {/* شیت جابجایی */}
      {transferFor ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setTransferFor(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-1">جابجایی نیرو</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {transferFor.fullName} — کارگاه فعلی: {workshopName(transferFor.workshopId)}
            </p>
            <div className="space-y-3">
              <button type="button" onClick={() => setTransferSheet('workshop')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-14">
                <span className="block text-[11px] text-muted-foreground mb-1">کارگاه مقصد</span>
                <span className="block text-sm font-medium truncate">{workshops.find((w) => w.id === toWorkshopId)?.name ?? 'انتخاب کنید'}</span>
              </button>
              <button type="button" onClick={() => setTransferSheet('date')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-14">
                <span className="block text-[11px] text-muted-foreground mb-1">تاریخ جابجایی</span>
                <span className="block text-sm font-medium">{formatJalaliFromISO(transferDate)}</span>
              </button>
              <Input
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="علت جابجایی (اختیاری)"
                className="h-11 bg-secondary/60"
                maxLength={300}
              />
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="outline" className="h-12" onClick={() => setTransferFor(null)} disabled={transferring}>
                  انصراف
                </Button>
                <Button className="h-12 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void submitTransfer()} disabled={transferring}>
                  {transferring ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}
                  ثبت جابجایی
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* شیت سابقهٔ جابجایی */}
      <Drawer.Root open={historyFor !== null} onOpenChange={(v) => !v && setHistoryFor(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none max-h-[85dvh] flex flex-col">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <div className="px-5 pt-3 pb-2">
              <Drawer.Title className="font-semibold">سابقهٔ جابجایی — {historyFor?.fullName}</Drawer.Title>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
              {historyLoading ? (
                <div className="flex justify-center py-10 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : history && history.length > 0 ? (
                <div className="space-y-2">
                  {history.map((t) => (
                    <div key={t.id} className="rounded-xl border border-border bg-card p-3">
                      <p className="text-sm">
                        <span className="text-muted-foreground">{t.fromWorkshopName ?? '—'}</span>
                        {' ← '}
                        <span className="font-medium">{t.toWorkshopName}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatJalaliTehran(t.transferredAt)}
                        {' · '}
                        {t.createdByName}
                        {t.reason ? ` · ${t.reason}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">جابجایی‌ای ثبت نشده است.</p>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <SelectionSheet
        open={transferSheet === 'workshop'}
        onOpenChange={(v) => setTransferSheet(v ? 'workshop' : null)}
        title="انتخاب کارگاه مقصد"
        options={workshops.filter((w) => w.id !== transferFor?.workshopId).map((w) => ({ id: w.id, label: w.name }))}
        selected={toWorkshopId ? [toWorkshopId] : []}
        onConfirm={(ids) => setToWorkshopId(ids[0] ?? '')}
      />
      <JalaliCalendarSheet
        open={transferSheet === 'date'}
        onOpenChange={(v) => setTransferSheet(v ? 'date' : null)}
        title="تاریخ جابجایی"
        value={transferDate}
        onSelect={(iso) => setTransferDate(iso)}
      />
    </div>
  )
}

// ─────────────────────────── فرم ایجاد/ویرایش فرد ───────────────────────────

function WorkerForm({
  worker,
  workshops,
  saving,
  onClose,
  onSave,
}: {
  worker: Worker | null
  workshops: WorkshopRef[]
  saving: boolean
  onClose: () => void
  onSave: (values: Record<string, unknown>) => void
}) {
  const [fullName, setFullName] = useState(worker?.fullName ?? '')
  const [kind, setKind] = useState(worker?.kind ?? 'LABORER')
  const [jobTitle, setJobTitle] = useState(worker?.jobTitle ?? '')
  const [phone, setPhone] = useState(worker?.phone ?? '')
  const [workshopId, setWorkshopId] = useState<string | null>(worker?.workshopId ?? null)
  const [isActive, setIsActive] = useState(worker?.isActive ?? true)
  const [wsOpen, setWsOpen] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-4">{worker ? 'ویرایش فرد' : 'فرد جدید'}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1.5">نام و نام خانوادگی <span className="text-red-500">*</span></label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-secondary/60 border-0" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">نقش</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm min-h-11">
              {Object.entries(WORKER_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">شرح وظایف</label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="مثلاً: بنّا — اجرای سقف" className="bg-secondary/60 border-0" maxLength={200} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">تلفن</label>
            <Input value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} className="bg-secondary/60 border-0" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">کارگاه</label>
            <button type="button" onClick={() => setWsOpen(true)} className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11">
              {workshopId ? workshops.find((w) => w.id === workshopId)?.name ?? '—' : 'انتخاب کارگاه…'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">فعال</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-5">
          <Button variant="outline" onClick={onClose} className="h-12 rounded-xl">
            انصراف
          </Button>
          <Button
            onClick={() =>
              onSave({
                fullName: fullName.trim(),
                kind,
                jobTitle: jobTitle.trim() || null,
                phone: phone.trim() || null,
                workshopId: workshopId ?? null,
                isActive,
              })
            }
            disabled={saving}
            className="h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </div>
      </div>

      <SelectionSheet
        open={wsOpen}
        onOpenChange={setWsOpen}
        title="انتخاب کارگاه"
        options={workshops.map((w) => ({ id: w.id, label: w.name }))}
        selected={workshopId ? [workshopId] : []}
        onConfirm={(ids) => setWorkshopId(ids[0] ?? null)}
      />
    </div>
  )
}

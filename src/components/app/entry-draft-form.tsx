"use client"

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Building2, Factory, Plus, Trash2, ChevronDown, Package, Users, FolderKanban,
  ClipboardType, StickyNote, AlertCircle, Loader2, CheckCircle2, CalendarDays, ArrowLeftRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type MasterData, type EntryDetailData } from '@/lib/client'
import { useApp } from '@/store/app'
import { SelectionSheet, ScreenHeader } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { ENTRY_TYPES, ENTRY_DIRECTIONS, SOURCE_TYPES, WORKER_KINDS, entryTypeLabel, type EntryTypeKey, type EntryDirectionKey } from '@/lib/permissions'
import { toFa, toEnDigits, formatJalaliFromISO, todayISO } from '@/lib/fa'

export interface DraftItem {
  materialId: string | null
  materialName: string
  quantity: string // ورودی متنی برای راحتی
  unit: string
  brand: string
}

export interface DraftWorker {
  workerId: string | null
  workerName: string
  workerKind: string
}

export interface DraftFormValue {
  /** جهت ثبت: ورود به انبار (IN) یا خروج از انبار (OUT) */
  direction: EntryDirectionKey
  type: EntryTypeKey
  sourceType: 'SUPPLIER' | 'WORKSHOP' | 'OTHER'
  sourceSupplierId: string | null
  sourceWorkshopId: string | null
  sourceLabel: string | null
  projectIds: string[]
  items: DraftItem[]
  workers: DraftWorker[]
  notes: string
  hasInvoice: boolean
  /** تاریخ ورود مصالح — ISO (YYYY-MM-DD)؛ پیش‌فرض: امروز */
  deliveryAt: string | null
  /** فیلدهای گمشده که باید با تأکید پر شوند (از AI) */
  highlight: Set<string>
}

export function emptyDraft(
  type: EntryTypeKey = 'PURCHASE',
  direction: EntryDirectionKey = 'IN',
  lockProjectId?: string
): DraftFormValue {
  return {
    direction,
    type,
    sourceType: type === 'TRANSFER' || type === 'LOAN' ? 'WORKSHOP' : 'SUPPLIER',
    sourceSupplierId: null,
    sourceWorkshopId: null,
    sourceLabel: null,
    projectIds: lockProjectId ? [lockProjectId] : [],
    items: [{ materialId: null, materialName: '', quantity: '', unit: '', brand: '' }],
    workers: [],
    notes: '',
    hasInvoice: false,
    deliveryAt: todayISO(),
    highlight: new Set(),
  }
}

export function EntryDraftForm({
  initial,
  title,
  subtitle,
  banner,
  editId,
  lockProjectId,
}: {
  initial: DraftFormValue
  title: string
  subtitle?: string
  banner?: React.ReactNode
  /** در حالت ویرایش — شناسه ثبت موجود */
  editId?: string
  /** پروژهٔ قفل‌شدهٔ جریان یکپارچه — مصالح حتماً به انبار کارگاه همین پروژه ثبت می‌شود */
  lockProjectId?: string
}) {
  const [v, setV] = useState<DraftFormValue>(
    lockProjectId && !initial.projectIds.includes(lockProjectId)
      ? { ...initial, projectIds: [lockProjectId] }
      : initial
  )
  const [master, setMaster] = useState<MasterData | null>(null)
  const [sheet, setSheet] = useState<null | 'type' | 'source' | 'projects' | 'material' | 'unit' | 'workers' | 'date'>(null)
  const [activeItem, setActiveItem] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(!!editId)
  // Item ۱ — موجودی انبار کارگاه برای جریان خروج (نمایش + مسدودسازی پیش از ارسال)
  const [stockRows, setStockRows] = useState<Array<{ materialName: string; unit: string; quantity: number }>>([])
  const navigate = useApp((s) => s.navigate)
  const back = useApp((s) => s.back)

  useEffect(() => {
    api
      .get<MasterData>('/api/v1/master')
      .then(setMaster)
      .catch(() => toast.error('دریافت اطلاعات پایه ناموفق بود.'))
  }, [])

  // پیش‌پرکردن در حالت ویرایش
  useEffect(() => {
    if (!editId) return
    api
      .get<EntryDetailData>(`/api/v1/material-entries/${editId}`)
      .then((res) => {
        const e = res.entry
        setV({
          direction: (e.direction ?? 'IN') as EntryDirectionKey,
          type: e.type as EntryTypeKey,
          sourceType: e.sourceType as DraftFormValue['sourceType'],
          sourceSupplierId: e.sourceSupplier?.id ?? null,
          sourceWorkshopId: e.sourceWorkshop?.id ?? null,
          sourceLabel:
            e.sourceType === 'SUPPLIER'
              ? e.sourceSupplier?.name ?? null
              : e.sourceType === 'WORKSHOP'
                ? e.sourceWorkshop?.name ?? null
                : e.sourceDescription,
          projectIds: lockProjectId ? [lockProjectId] : e.projects.map((p) => p.project.id),
          items: e.items.map((it) => ({
            materialId: it.materialId,
            materialName: it.materialName,
            quantity: String(it.quantity),
            unit: it.unit,
            brand: it.brand ?? '',
          })),
          workers: e.workers.map((w) => ({ workerId: w.workerId, workerName: w.workerName, workerKind: w.workerKind })),
          notes: e.notes ?? '',
          hasInvoice: e.hasInvoice,
          deliveryAt: e.deliveryAt ? String(e.deliveryAt).slice(0, 10) : null,
          highlight: new Set(),
        })
      })
      .catch(() => {
        toast.error('دریافت اطلاعات ثبت ناموفق بود.')
        back()
      })
      .finally(() => setLoadingEdit(false))
     
  }, [editId])

  const set = <K extends keyof DraftFormValue>(key: K, value: DraftFormValue[K]) => setV((p) => ({ ...p, [key]: value }))

  function setItem(idx: number, patch: Partial<DraftItem>) {
    setV((p) => ({
      ...p,
      items: p.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }))
  }

  const projectOptions = useMemo(() => (master?.projects ?? []).map((p) => ({ id: p.id, label: p.name, hint: p.code })), [master])
  const supplierOptions = useMemo(() => (master?.suppliers ?? []).map((s) => ({ id: s.id, label: s.name })), [master])
  const workshopOptions = useMemo(() => (master?.workshops ?? []).map((w) => ({ id: w.id, label: w.name })), [master])
  const materialOptions = useMemo(() => (master?.materials ?? []).map((m) => ({ id: m.id, label: m.name, hint: m.category ?? undefined })), [master])
  const unitOptions = useMemo(() => (master?.units ?? []).map((u) => ({ id: u.title, label: u.title })), [master])
  const workerOptions = useMemo(() => (master?.workers ?? []).map((w) => ({ id: w.id, label: w.fullName, hint: WORKER_KINDS[w.kind as keyof typeof WORKER_KINDS] ?? w.kind })), [master])

  // Item ۱ — کارگاهی که موجودی خروج باید از آن بررسی شود: انبار کارگاه پروژهٔ انتخاب‌شده
  const stockWorkshopId = useMemo(() => {
    if (v.direction !== 'OUT') return null
    const pid = lockProjectId ?? v.projectIds[0]
    if (!pid) return null
    return master?.projects.find((p) => p.id === pid)?.workshopId ?? null
  }, [v.direction, lockProjectId, v.projectIds, master])

  useEffect(() => {
    if (!stockWorkshopId) {
      setStockRows([])
      return
    }
    api
      .get<{ stocks: Array<{ materialName: string; unit: string; quantity: number }> }>(`/api/v1/inventory?workshopId=${stockWorkshopId}`)
      .then((r) => setStockRows(r.stocks))
      .catch(() => setStockRows([]))
  }, [stockWorkshopId])

  // Item ۱ — بررسی موجودی هر قلم خروجی (اقلام تکراری با نام/واحد یکسان تجمیع می‌شوند)
  // فقط وقتی لیست موجودی با موفقیت دریافت شده باشد بررسی می‌کنیم؛ در غیر این صورت
  // اعتبارسنجی نهایی به سرور واگذار می‌شود (جلوگیری از مسدودسازیِ اشتباه جریان خروج).
  const stockShortages = useMemo(() => {
    if (v.direction !== 'OUT' || stockRows.length === 0) return [] as Array<{ materialName: string; unit: string; requested: number; available: number }>
    const aggregated = new Map<string, { materialName: string; unit: string; requested: number }>()
    for (const it of v.items) {
      const name = it.materialName.trim()
      const q = Number(toEnDigits(it.quantity))
      if (!name || !(q > 0)) continue
      const key = `${name}|${it.unit}`
      const prev = aggregated.get(key)
      if (prev) prev.requested += q
      else aggregated.set(key, { materialName: name, unit: it.unit, requested: q })
    }
    const out: Array<{ materialName: string; unit: string; requested: number; available: number }> = []
    for (const it of aggregated.values()) {
      const available = stockRows.find((s) => s.materialName === it.materialName && s.unit === it.unit)?.quantity ?? 0
      if (available < it.requested) out.push({ ...it, available })
    }
    return out
  }, [v.direction, v.items, stockRows])

  // موجودی انبار برای نمایش در ردیف قلم خروجی
  function stockOf(name: string, unit: string): number | null {
    if (v.direction !== 'OUT' || !name.trim() || stockRows.length === 0) return null
    return stockRows.find((s) => s.materialName === name.trim() && s.unit === unit)?.quantity ?? 0
  }

  // ─────────────────────────── اعتبارسنجی با پیام انسانی ───────────────────────────
  const errors = useMemo(() => {
    const errs: string[] = []
    if (!v.type) errs.push('نوع ورود را انتخاب کنید.')
    if (v.projectIds.length === 0) errs.push('حداقل یک پروژه انتخاب کنید.')
    const hasSource = v.sourceType === 'SUPPLIER' ? !!v.sourceSupplierId : v.sourceType === 'WORKSHOP' ? !!v.sourceWorkshopId : !!v.sourceLabel
    // Item ۳ — پیام متناسب با جهت جریان: خروج → مقصد، ورود → مبدأ
    if (!hasSource) errs.push(v.direction === 'OUT' ? 'مقصد این محموله را مشخص کنید.' : 'مبدا این محموله را مشخص کنید.')
    if (v.items.length === 0) errs.push('حداقل یک قلم مصالح اضافه کنید.')
    for (const [i, it] of v.items.entries()) {
      if (!it.materialName.trim()) errs.push(`نام مصالح قلم ${toFa(i + 1)} را وارد کنید.`)
      const q = toEnDigits(it.quantity)
      if (!q || Number(q) <= 0) errs.push(`مقدار «${it.materialName || `قلم ${toFa(i + 1)}`}» را وارد کنید.`)
      if (!it.unit) errs.push(`واحد «${it.materialName || `قلم ${toFa(i + 1)}`}» را انتخاب کنید.`)
    }
    // Item ۱ — مسدودسازی پیش از ارسال: هر قلم خروجی باید موجودی کافی داشته باشد
    for (const s of stockShortages) {
      errs.push(`موجودی کافی نیست — «${s.materialName}»: درخواست ${toFa(s.requested)} ${s.unit} / موجودی ${toFa(s.available)} ${s.unit}`)
    }
    return errs
  }, [v, stockShortages])

  async function saveDraft() {
    setShowErrors(true)
    if (errors.length > 0) {
      toast.error(errors[0])
      return
    }
    setSaving(true)
    try {
      const payload = {
        direction: v.direction,
        type: v.type,
        sourceType: v.sourceType,
        sourceSupplierId: v.sourceSupplierId,
        sourceWorkshopId: v.sourceWorkshopId,
        sourceDescription: v.sourceType === 'OTHER' ? v.sourceLabel : v.sourceLabel,
        projectIds: lockProjectId ? [lockProjectId] : v.projectIds,
        items: v.items.map((it, idx) => ({
          materialId: it.materialId,
          materialName: it.materialName,
          quantity: Number(toEnDigits(it.quantity)),
          unit: it.unit,
          brand: it.brand || null,
          sortOrder: idx,
        })),
        workers: v.workers.map((w) => ({ workerId: w.workerId, workerName: w.workerName, workerKind: w.workerKind })),
        notes: v.notes || null,
        hasInvoice: v.hasInvoice,
        deliveryAt: v.deliveryAt ?? null,
      }
      if (editId) {
        await api.patch(`/api/v1/material-entries/${editId}`, payload)
        toast.success('ثبت ویرایش شد — نسخه جدید ایجاد شد.')
        navigate('entry-detail', { id: editId }, true)
      } else {
        const res = await api.post<{ id: string; entryNumber: number }>('/api/v1/material-entries', {
          ...payload,
          status: 'DRAFT',
          clientRequestId: crypto.randomUUID(),
        })
        toast.success(`پیش‌نویس شماره ${toFa(res.entryNumber)} ساخته شد — بررسی و ارسال کنید`)
        navigate('entry-detail', { id: res.id, justCreated: true }, true)
      }
    } catch (err) {
      if (err instanceof ClientApiError) {
        if (err.code === 'OFFLINE_QUEUED') {
          toast.success('اتصال قطع است — پیش‌نویس در صف ارسال خودکار قرار گرفت')
          back()
          return
        }
        toast.error(err.message)
        // اگر رکورد قفل بود به جزئیات برگرد
        if (err.code === 'ENTRY_LOCKED' && editId) navigate('entry-detail', { id: editId }, true)
      } else toast.error('خطا در ذخیره پیش‌نویس.')
    } finally {
      setSaving(false)
    }
  }

  const hl = (field: string) => v.highlight.has(field)

  const isOut = v.direction === 'OUT'
  const lockedProject = useMemo(
    () => (lockProjectId ? master?.projects.find((p) => p.id === lockProjectId) ?? null : null),
    [lockProjectId, master]
  )
  const lockedWorkshop = useMemo(
    () => (lockedProject?.workshopId ? master?.workshops.find((w) => w.id === lockedProject.workshopId) ?? null : null),
    [lockedProject, master]
  )

  if (loadingEdit) {
    return (
      <div className="max-w-lg mx-auto min-h-dvh flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh flex flex-col">
      <ScreenHeader title={title} subtitle={subtitle} onBack={back} />
      {banner}

      <div className="p-4 space-y-4 pb-32">
        {/* جهت ثبت — ورود / خروج */}
        <Section icon={<ArrowLeftRight className="size-4" />} label="جهت ثبت" required>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ENTRY_DIRECTIONS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => set('direction', key as EntryDirectionKey)}
                className={`rounded-xl border px-3 py-3 text-sm font-medium min-h-11 transition-colors ${
                  v.direction === key ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* نوع ورود */}
        <Section icon={<ClipboardType className="size-4" />} label={isOut ? 'نوع خروج' : 'نوع ورود'} required missing={hl('type')}>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ENTRY_TYPES).map(([key]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  set('type', key as EntryTypeKey)
                  if (key === 'TRANSFER' || key === 'LOAN') set('sourceType', 'WORKSHOP')
                  if (key === 'PURCHASE') set('sourceType', 'SUPPLIER')
                }}
                className={`rounded-xl border px-3 py-3 text-sm font-medium min-h-11 transition-colors ${
                  v.type === key ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border'
                }`}
              >
                {entryTypeLabel(key, v.direction)}
              </button>
            ))}
          </div>
        </Section>

        {/* پروژه‌ها */}
        <Section
          icon={<FolderKanban className="size-4" />}
          label="پروژه / پروژه‌ها"
          required
          missing={hl('project') || errors.some((e) => e.includes('پروژه')) && showErrors}
          hint={lockProjectId ? 'قفل‌شده' : undefined}
        >
          {lockProjectId ? (
            // جریان یکپارچه — پروژه از قبل انتخاب شده و مصالات به انبار کارگاه همین پروژه ثبت می‌شود
            <div className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 min-h-12 flex items-center gap-2">
              <FolderKanban className="size-4 text-accent shrink-0" />
              <span className="text-sm font-medium truncate">{lockedProject?.name ?? 'پروژهٔ انتخاب‌شده'}</span>
              {lockedWorkshop ? (
                <span className="text-[11px] text-muted-foreground mr-auto shrink-0">انبار {lockedWorkshop.name}</span>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSheet('projects')}
              className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 min-h-12 text-right"
            >
              <span className={v.projectIds.length ? 'text-sm' : 'text-sm text-muted-foreground'}>
                {v.projectIds.length
                  ? v.projectIds
                      .map((id) => projectOptions.find((o) => o.id === id)?.label)
                      .filter(Boolean)
                      .join('، ')
                  : 'انتخاب پروژه…'}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          )}
        </Section>

        {/* مبدأ / مقصد — بسته به جهت جریان */}
        <Section icon={v.sourceType === 'SUPPLIER' ? <Factory className="size-4" /> : <Building2 className="size-4" />} label={isOut ? 'مقصد خروج' : 'مبدأ ورود'} required missing={hl('source') || (showErrors && errors.some((e) => e.includes('مبدأ') || e.includes('مقصد')))}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {Object.entries(SOURCE_TYPES).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  set('sourceType', key as 'SUPPLIER' | 'WORKSHOP' | 'OTHER')
                  set('sourceSupplierId', null)
                  set('sourceWorkshopId', null)
                  set('sourceLabel', null)
                }}
                className={`rounded-xl border px-2 py-2.5 text-xs font-medium min-h-11 transition-colors ${
                  v.sourceType === key ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {v.sourceType === 'SUPPLIER' ? (
            <button
              type="button"
              onClick={() => setSheet('source')}
              className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 min-h-12 text-right"
            >
              <span className={v.sourceLabel ? 'text-sm' : 'text-sm text-muted-foreground'}>{v.sourceLabel ?? 'انتخاب تأمین‌کننده…'}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          ) : v.sourceType === 'WORKSHOP' ? (
            <button
              type="button"
              onClick={() => setSheet('source')}
              className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 min-h-12 text-right"
            >
              <span className={v.sourceLabel ? 'text-sm' : 'text-sm text-muted-foreground'}>{v.sourceLabel ?? (isOut ? 'انتخاب کارگاه مقصد…' : 'انتخاب کارگاه مبدأ…')}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          ) : (
            <Input
              value={v.sourceLabel ?? ''}
              onChange={(e) => set('sourceLabel', e.target.value)}
              placeholder="مثلاً: حواله انبار مرکزی"
              className="bg-card"
            />
          )}
        </Section>

        {/* تاریخ ثبت — تقویم شمسی پاپ‌آپ */}
        <Section icon={<CalendarDays className="size-4" />} label={isOut ? 'تاریخ خروج مصالح' : 'تاریخ ورود مصالح'} hint="اختیاری — پیش‌فرض امروز">
          <button
            type="button"
            onClick={() => setSheet('date')}
            className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 min-h-12 text-right"
            aria-label={isOut ? 'انتخاب تاریخ خروج' : 'انتخاب تاریخ ورود'}
          >
            <span className={v.deliveryAt ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
              {v.deliveryAt ? formatJalaliFromISO(v.deliveryAt) : 'انتخاب تاریخ…'}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </Section>

        {/* اقلام مصالح */}
        <Section
          icon={<Package className="size-4" />}
          label="اقلام مصالح"
          required
          missing={hl('items') || hl('quantity') || hl('unit') || (showErrors && errors.some((e) => e.includes('قلم') || e.includes('مقدار') || e.includes('واحد')))}
        >
          <div className="space-y-2.5">
            {v.items.map((it, idx) => (
              <div key={idx} className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-muted-foreground bg-secondary rounded-md px-2 py-0.5">{toFa(idx + 1)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveItem(idx)
                      setSheet('material')
                    }}
                    className="flex-1 text-right text-sm min-h-11 px-2 rounded-lg bg-secondary/60"
                  >
                    {it.materialName || <span className="text-muted-foreground">انتخاب مصالح…</span>}
                  </button>
                  {v.items.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => set('items', v.items.filter((_, i) => i !== idx))}
                      className="size-11 flex items-center justify-center text-red-500"
                      aria-label="حذف قلم"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Input
                      value={toFa(it.quantity)}
                      onChange={(e) => setItem(idx, { quantity: toEnDigits(e.target.value).replace(/[^0-9.]/g, '') })}
                      placeholder="مقدار"
                      inputMode="decimal"
                      className="numeric-input bg-secondary/60 border-0 pl-16"
                      aria-label="مقدار"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setActiveItem(idx)
                        setSheet('unit')
                      }}
                      className="absolute left-1 top-1 bottom-1 px-3 rounded-md bg-card border border-border text-xs font-medium flex items-center gap-1"
                    >
                      {it.unit || 'واحد'}
                      <ChevronDown className="size-3" />
                    </button>
                  </div>
                  <Input
                    value={it.brand}
                    onChange={(e) => setItem(idx, { brand: e.target.value })}
                    placeholder="برند (اختیاری)"
                    className="bg-secondary/60 border-0"
                  />
                </div>
                {/* Item ۱ — نمایش موجودی انبار کارگاه در برابر مقدار درخواستی برای این قلم خروجی */}
                {(() => {
                  const available = stockOf(it.materialName, it.unit)
                  if (available === null) return null
                  const requested = Number(toEnDigits(it.quantity))
                  const insufficient = requested > 0 && available < requested
                  return (
                    <div className={`flex items-center gap-1.5 text-[11px] ${insufficient ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                      <Package className="size-3.5 shrink-0" />
                      <span>
                        موجودی انبار: {toFa(available)} {it.unit}
                        {requested > 0 ? <> / درخواست: {toFa(requested)} {it.unit}</> : null}
                      </span>
                      {insufficient ? <span className="font-bold">— موجودی کافی نیست</span> : null}
                    </div>
                  )
                })()}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={() => set('items', [...v.items, { materialId: null, materialName: '', quantity: '', unit: '', brand: '' }])}
            >
              <Plus className="size-4" />
              افزودن قلم دیگر
            </Button>
          </div>
        </Section>

        {/* افراد */}
        <Section icon={<Users className="size-4" />} label="افراد (تخلیه / راننده / …)" hint="اختیاری">
          <button
            type="button"
            onClick={() => setSheet('workers')}
            className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 min-h-12 text-right"
          >
            <span className={v.workers.length ? 'text-sm' : 'text-sm text-muted-foreground'}>
              {v.workers.length ? v.workers.map((w) => w.workerName).join('، ') : 'افزودن افراد…'}
            </span>
            <Plus className="size-4 text-muted-foreground" />
          </button>
        </Section>

        {/* یادداشت */}
        <Section icon={<StickyNote className="size-4" />} label="یادداشت" hint="اختیاری">
          <Textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="هر نکته‌ای که لازم است…" className="bg-card" />
        </Section>

        {/* فاکتور */}
        <button
          type="button"
          onClick={() => set('hasInvoice', !v.hasInvoice)}
          className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-right min-h-14 transition-colors ${
            v.hasInvoice ? 'bg-green-50 border-green-300' : 'bg-card border-border'
          }`}
        >
          {v.hasInvoice ? <CheckCircle2 className="size-5 text-green-600" /> : <AlertCircle className="size-5 text-muted-foreground" />}
          <span className="text-sm font-medium">فاکتور / مدارک دارم</span>
          <span className="text-[11px] text-muted-foreground mr-auto">پس از پیش‌نویس، عکس پیوست می‌شود</span>
        </button>

        {showErrors && errors.length > 0 ? (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-xs font-semibold text-red-700 mb-1.5">برای ادامه این موارد را کامل کنید:</p>
            <ul className="space-y-1">
              {errors.map((e) => (
                <li key={e} className="text-xs text-red-600">
                  • {e}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* دکمه ثابت */}
      <div className="fixed bottom-0 inset-x-0 z-40 safe-bottom bg-background/95 backdrop-blur border-t border-border px-4 pt-3">
        <div className="max-w-lg mx-auto">
          <Button onClick={saveDraft} disabled={saving} className="w-full h-13 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-base h-12">
            {saving ? <Loader2 className="size-5 animate-spin" /> : 'ادامه و مشاهده پیش‌نمایش'}
          </Button>
        </div>
      </div>

      {/* Bottom Sheetها */}
      <SelectionSheet
        open={sheet === 'projects'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="انتخاب پروژه"
        options={projectOptions}
        selected={v.projectIds}
        multi
        onConfirm={(ids) => set('projectIds', ids)}
      />
      <SelectionSheet
        open={sheet === 'source'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={v.sourceType === 'SUPPLIER' ? 'انتخاب تأمین‌کننده' : isOut ? 'انتخاب کارگاه مقصد' : 'انتخاب کارگاه مبدأ'}
        options={v.sourceType === 'SUPPLIER' ? supplierOptions : workshopOptions}
        selected={[]}
        onConfirm={(ids) => {
          const id = ids[0]
          if (v.sourceType === 'SUPPLIER') {
            set('sourceSupplierId', id)
            set('sourceLabel', supplierOptions.find((o) => o.id === id)?.label ?? null)
          } else {
            set('sourceWorkshopId', id)
            set('sourceLabel', workshopOptions.find((o) => o.id === id)?.label ?? null)
          }
        }}
      />
      <SelectionSheet
        open={sheet === 'material'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="انتخاب مصالح"
        options={materialOptions}
        selected={[]}
        onConfirm={(ids) => {
          if (activeItem === null) return
          const m = master?.materials.find((x) => x.id === ids[0])
          // Item ۲ — تغییر مصالح، واحد ردیف را به واحد پیش‌فرض مصالحِ جدید به‌روز می‌کند
          if (m) setItem(activeItem, { materialId: m.id, materialName: m.name, unit: m.defaultUnit || v.items[activeItem].unit || '' })
        }}
      />
      <SelectionSheet
        open={sheet === 'unit'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="واحد اندازه‌گیری"
        searchable={false}
        options={unitOptions}
        selected={[]}
        onConfirm={(ids) => {
          if (activeItem !== null) setItem(activeItem, { unit: ids[0] })
        }}
      />
      <SelectionSheet
        open={sheet === 'workers'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="انتخاب افراد"
        options={workerOptions}
        selected={v.workers.map((w) => w.workerId).filter((x): x is string => !!x)}
        multi
        onConfirm={(ids) => {
          const picked = ids.map((id) => {
            const w = master?.workers.find((x) => x.id === id)
            return { workerId: id, workerName: w?.fullName ?? '', workerKind: w?.kind ?? 'LABORER' }
          })
          set('workers', picked)
        }}
      />
      <JalaliCalendarSheet
        open={sheet === 'date'}
        onOpenChange={(o) => !o && setSheet(null)}
        value={v.deliveryAt}
        onSelect={(iso) => set('deliveryAt', iso)}
        title={isOut ? 'تاریخ خروج مصالح' : 'تاریخ ورود مصالح'}
        disableFuture
      />
    </div>
  )
}

function Section({
  icon,
  label,
  hint,
  required,
  missing,
  children,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  required?: boolean
  missing?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-2xl border p-4 ${missing ? 'border-orange-300 bg-orange-50/50' : 'border-border bg-card/40'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`flex items-center justify-center size-7 rounded-lg ${missing ? 'bg-orange-100 text-orange-600' : 'bg-secondary text-muted-foreground'}`}>{icon}</span>
        <h3 className="text-sm font-semibold">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </h3>
        {hint ? <span className="text-[11px] text-muted-foreground mr-auto">{hint}</span> : null}
        {missing ? <span className="text-[11px] text-orange-600 font-medium mr-auto">نیاز به تکمیل</span> : null}
      </div>
      {children}
    </section>
  )
}

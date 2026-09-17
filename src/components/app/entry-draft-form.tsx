"use client"

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Building2, Factory, Plus, Trash2, ChevronDown, Package, Users, FolderKanban,
  ClipboardType, StickyNote, AlertCircle, Loader2, CheckCircle2, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type MasterData, type EntryDetailData } from '@/lib/client'
import { useApp } from '@/store/app'
import { SelectionSheet, ScreenHeader } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { ENTRY_TYPES, SOURCE_TYPES, WORKER_KINDS, type EntryTypeKey } from '@/lib/permissions'
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

export function emptyDraft(type: EntryTypeKey = 'PURCHASE'): DraftFormValue {
  return {
    type,
    sourceType: type === 'TRANSFER' || type === 'LOAN' ? 'WORKSHOP' : 'SUPPLIER',
    sourceSupplierId: null,
    sourceWorkshopId: null,
    sourceLabel: null,
    projectIds: [],
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
}: {
  initial: DraftFormValue
  title: string
  subtitle?: string
  banner?: React.ReactNode
  /** در حالت ویرایش — شناسه ثبت موجود */
  editId?: string
}) {
  const [v, setV] = useState<DraftFormValue>(initial)
  const [master, setMaster] = useState<MasterData | null>(null)
  const [sheet, setSheet] = useState<null | 'type' | 'source' | 'projects' | 'material' | 'unit' | 'workers' | 'date'>(null)
  const [activeItem, setActiveItem] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(!!editId)
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
          projectIds: e.projects.map((p) => p.project.id),
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

  // ─────────────────────────── اعتبارسنجی با پیام انسانی ───────────────────────────
  const errors = useMemo(() => {
    const errs: string[] = []
    if (!v.type) errs.push('نوع ورود را انتخاب کنید.')
    if (v.projectIds.length === 0) errs.push('حداقل یک پروژه انتخاب کنید.')
    const hasSource = v.sourceType === 'SUPPLIER' ? !!v.sourceSupplierId : v.sourceType === 'WORKSHOP' ? !!v.sourceWorkshopId : !!v.sourceLabel
    if (!hasSource) errs.push('مبدأ این محموله را مشخص کنید.')
    if (v.items.length === 0) errs.push('حداقل یک قلم مصالح اضافه کنید.')
    for (const [i, it] of v.items.entries()) {
      if (!it.materialName.trim()) errs.push(`نام مصالح قلم ${toFa(i + 1)} را وارد کنید.`)
      const q = toEnDigits(it.quantity)
      if (!q || Number(q) <= 0) errs.push(`مقدار «${it.materialName || `قلم ${toFa(i + 1)}`}» را وارد کنید.`)
      if (!it.unit) errs.push(`واحد «${it.materialName || `قلم ${toFa(i + 1)}`}» را انتخاب کنید.`)
    }
    return errs
  }, [v])

  async function saveDraft() {
    setShowErrors(true)
    if (errors.length > 0) {
      toast.error(errors[0])
      return
    }
    setSaving(true)
    try {
      const payload = {
        type: v.type,
        sourceType: v.sourceType,
        sourceSupplierId: v.sourceSupplierId,
        sourceWorkshopId: v.sourceWorkshopId,
        sourceDescription: v.sourceType === 'OTHER' ? v.sourceLabel : v.sourceLabel,
        projectIds: v.projectIds,
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
        {/* نوع ورود */}
        <Section icon={<ClipboardType className="size-4" />} label="نوع ورود" required missing={hl('type')}>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ENTRY_TYPES).map(([key, label]) => (
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
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* پروژه‌ها */}
        <Section icon={<FolderKanban className="size-4" />} label="پروژه / پروژه‌ها" required missing={hl('project') || errors.some((e) => e.includes('پروژه')) && showErrors}>
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
        </Section>

        {/* مبدأ */}
        <Section icon={v.sourceType === 'SUPPLIER' ? <Factory className="size-4" /> : <Building2 className="size-4" />} label="مبدأ ورود" required missing={hl('source') || (showErrors && errors.some((e) => e.includes('مبدأ')))}>
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
              <span className={v.sourceLabel ? 'text-sm' : 'text-sm text-muted-foreground'}>{v.sourceLabel ?? 'انتخاب کارگاه مبدأ…'}</span>
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

        {/* تاریخ ورود — تقویم شمسی پاپ‌آپ */}
        <Section icon={<CalendarDays className="size-4" />} label="تاریخ ورود مصالح" hint="اختیاری — پیش‌فرض امروز">
          <button
            type="button"
            onClick={() => setSheet('date')}
            className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 min-h-12 text-right"
            aria-label="انتخاب تاریخ ورود"
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
        title={v.sourceType === 'SUPPLIER' ? 'انتخاب تأمین‌کننده' : 'انتخاب کارگاه مبدأ'}
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
          if (m) setItem(activeItem, { materialId: m.id, materialName: m.name, unit: v.items[activeItem].unit || m.defaultUnit || '' })
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
        title="تاریخ ورود مصالح"
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

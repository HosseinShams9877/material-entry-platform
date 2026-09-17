"use client"

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Save, Loader2, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ClientApiError, type MasterData, type PurchaseRequestDetail } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, SelectionSheet } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { toFa, todayISO, formatJalaliFromISO, formatJalaliTehranToISO } from '@/lib/fa'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

interface ItemDraft {
  key: string
  materialId: string | null
  materialName: string
  quantity: string
  unit: string
  note: string
}

type SheetKind = 'workshop' | 'project' | 'material' | 'unit' | 'date' | null

function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

export default function PurchaseForm({ params }: { params?: Record<string, unknown> }) {
  const editId = typeof params?.id === 'string' ? params.id : null
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)

  const [md, setMd] = useState<MasterData | null>(null)
  const [loaded, setLoaded] = useState(editId === null)
  const [workshopId, setWorkshopId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([
    { key: `it-0`, materialId: null, materialName: '', quantity: '', unit: '', note: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<MasterData>('/api/v1/master')
      .then((data) => {
        setMd(data)
        if (!editId) setWorkshopId(data.workshops[0]?.id ?? '')
      })
      .catch(() => toast.error(ERROR_MSG))
  }, [editId])

  useEffect(() => {
    if (!editId) return
    api
      .get<{ request: PurchaseRequestDetail }>(`/api/v1/purchase-requests/${editId}`)
      .then(({ request }) => {
        setWorkshopId(request.workshopId)
        setProjectId(request.projectId ?? '')
        setNeededBy(request.neededBy ? formatJalaliTehranToISO(request.neededBy) : '')
        setNote(request.note ?? '')
        setItems(
          request.items.map((i, idx) => ({
            key: `it-${idx}-${i.id}`,
            materialId: i.materialId,
            materialName: i.materialName,
            quantity: String(i.quantity),
            unit: i.unit,
            note: i.note ?? '',
          }))
        )
        setLoaded(true)
      })
      .catch(() => {
        toast.error('درخواست یافت نشد.')
        back()
      })
  }, [editId, back])

  const workshopOptions = useMemo(() => (md?.workshops ?? []).map((w) => ({ id: w.id, label: w.name, hint: w.code })), [md])
  const projectOptions = useMemo(
    () => (md?.projects ?? []).filter((p) => !workshopId || p.workshopId === null || p.workshopId === workshopId).map((p) => ({ id: p.id, label: p.name, hint: p.code })),
    [md, workshopId]
  )
  const materialOptions = useMemo(() => (md?.materials ?? []).map((m) => ({ id: m.id, label: m.name, hint: m.defaultUnit ?? undefined })), [md])
  const unitOptions = useMemo(() => (md?.units ?? []).map((u) => ({ id: u.title, label: u.title })), [md])

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, { key: `it-${Date.now()}-${prev.length}`, materialId: null, materialName: '', quantity: '', unit: '', note: '' }])
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev))
  }

  async function save() {
    const cleanItems = items
      .map((it, idx) => ({
        materialId: it.materialId,
        materialName: it.materialName.trim(),
        quantity: Number(toEnDigits(it.quantity).replace(/[^\d.]/g, '')),
        unit: it.unit.trim(),
        note: it.note.trim() || null,
        sortOrder: idx,
      }))
      .filter((it) => it.materialName.length > 0)
    if (!workshopId) {
      toast.error('کارگاه را انتخاب کنید.')
      return
    }
    if (cleanItems.length === 0) {
      toast.error('حداقل یک قلم نیاز اضافه کنید.')
      return
    }
    if (cleanItems.some((it) => !(it.quantity > 0))) {
      toast.error('مقدار همهٔ اقلام را وارد کنید.')
      return
    }
    if (cleanItems.some((it) => it.unit.length === 0)) {
      toast.error('واحد اندازه‌گیری همهٔ اقلام را انتخاب کنید.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        workshopId,
        projectId: projectId || null,
        neededBy: neededBy || null,
        note: note.trim() || null,
        items: cleanItems,
      }
      if (editId) {
        await api.patch(`/api/v1/purchase-requests/${editId}`, payload)
        toast.success('درخواست به‌روزرسانی شد.')
        navigate('purchase-detail', { id: editId }, true)
      } else {
        const res = await api.post<{ requestId: string }>('/api/v1/purchase-requests', payload)
        toast.success('اعلام نیاز ثبت شد و برای تأیید ارسال گردید.')
        navigate('purchase-detail', { id: res.requestId }, true)
      }
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در ثبت درخواست خرید.')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title={editId ? 'ویرایش درخواست' : 'اعلام نیاز خرید'} onBack={back} />
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <ScreenHeader
        title={editId ? 'ویرایش درخواست خرید' : 'اعلام نیاز خرید'}
        subtitle="انباردار: مصالح موردنیاز کارگاه را اعلام کنید"
        onBack={back}
      />

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setSheet('workshop')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
            <span className="block text-[11px] text-muted-foreground mb-1">کارگاه</span>
            <span className="block text-sm font-medium truncate">{md?.workshops.find((w) => w.id === workshopId)?.name ?? 'انتخاب کنید'}</span>
          </button>
          <button type="button" onClick={() => setSheet('project')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
            <span className="block text-[11px] text-muted-foreground mb-1">پروژه (اختیاری)</span>
            <span className="block text-sm font-medium truncate">{md?.projects.find((p) => p.id === projectId)?.name ?? 'انتخاب کنید'}</span>
          </button>
        </div>

        <button type="button" onClick={() => setSheet('date')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-16">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
            <CalendarDays className="size-3" />
            تاریخ نیاز (اختیاری)
          </span>
          <span className="block text-sm font-medium">{neededBy ? formatJalaliFromISO(neededBy) : 'انتخاب کنید'}</span>
        </button>

        {/* اقلام */}
        <div className="space-y-2.5">
          {items.map((it, idx) => (
            <div key={it.key} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">قلم {toFa(idx + 1)}</span>
                {items.length > 1 ? (
                  <button type="button" onClick={() => removeItem(it.key)} className="text-red-500 p-1" aria-label="حذف قلم">
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveItemKey(it.key)
                  setSheet('material')
                }}
                className={cn(
                  'w-full rounded-lg border px-3 py-2.5 text-right text-sm min-h-11',
                  it.materialName ? 'border-border bg-secondary/60 font-medium' : 'border-dashed border-border text-muted-foreground'
                )}
              >
                {it.materialName || 'انتخاب مصالح از فهرست…'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={it.quantity}
                  onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
                  placeholder="مقدار"
                  className="h-11 numeric-input bg-secondary/60"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() => {
                    setActiveItemKey(it.key)
                    setSheet('unit')
                  }}
                  className="rounded-lg border border-border bg-secondary/60 px-3 text-sm text-right min-h-11"
                >
                  {it.unit || 'واحد'}
                </button>
              </div>
              <Input
                value={it.note}
                onChange={(e) => updateItem(it.key, { note: e.target.value })}
                placeholder="توضیح (اختیاری) — مثلاً برند یا مشخصات"
                className="h-10 text-xs bg-secondary/60"
                maxLength={300}
              />
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full h-11" onClick={addItem}>
            <Plus className="size-4" />
            افزودن قلم
          </Button>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="توضیح کلی درخواست (اختیاری)"
          className="w-full rounded-lg border border-border bg-card p-3 text-sm leading-7 outline-none"
          maxLength={1000}
        />

        <Button type="button" className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground sticky bottom-20" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          ثبت اعلام نیاز
        </Button>
      </div>

      <SelectionSheet
        open={sheet === 'workshop'}
        onOpenChange={(v) => setSheet(v ? 'workshop' : null)}
        title="انتخاب کارگاه"
        options={workshopOptions}
        selected={[workshopId]}
        onConfirm={(ids) => {
          setWorkshopId(ids[0] ?? '')
          const prj = md?.projects.find((p) => p.id === projectId)
          if (prj && prj.workshopId && prj.workshopId !== ids[0]) setProjectId('')
        }}
      />
      <SelectionSheet
        open={sheet === 'project'}
        onOpenChange={(v) => setSheet(v ? 'project' : null)}
        title="انتخاب پروژه"
        options={projectOptions}
        selected={[projectId]}
        onConfirm={(ids) => setProjectId(ids[0] ?? '')}
      />
      <SelectionSheet
        open={sheet === 'material'}
        onOpenChange={(v) => setSheet(v ? 'material' : null)}
        title="انتخاب مصالح"
        options={materialOptions}
        selected={[]}
        onConfirm={(ids) => {
          const m = md?.materials.find((x) => x.id === ids[0])
          if (activeItemKey && m) {
            updateItem(activeItemKey, { materialId: m.id, materialName: m.name, unit: m.defaultUnit ?? '' })
          }
          setActiveItemKey(null)
        }}
      />
      <SelectionSheet
        open={sheet === 'unit'}
        onOpenChange={(v) => setSheet(v ? 'unit' : null)}
        title="انتخاب واحد"
        options={unitOptions}
        selected={[]}
        onConfirm={(ids) => {
          if (activeItemKey) updateItem(activeItemKey, { unit: ids[0] ?? '' })
          setActiveItemKey(null)
        }}
      />
      <JalaliCalendarSheet
        open={sheet === 'date'}
        onOpenChange={(v) => setSheet(v ? 'date' : null)}
        title="تاریخ نیاز"
        value={neededBy || todayISO()}
        onSelect={(iso) => setNeededBy(iso)}
      />
    </div>
  )
}

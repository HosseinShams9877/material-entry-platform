"use client"

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Package, ArrowDownToLine, ArrowUpFromLine, Plus, AlertTriangle, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ClientApiError, type InventoryStockItem, type InventoryMovementItem, type MasterData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, EmptyState, ErrorState, ListSkeleton, SelectionSheet } from '@/components/app/shared'
import { toFa, formatQty, formatRelative } from '@/lib/fa'
import { INVENTORY_REASONS, INVENTORY_DIRECTIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

type Tab = 'stocks' | 'movements'
type SheetKind = 'workshop-out' | 'material-out' | 'workshop-in' | 'material-in' | null

interface StockDraft {
  workshopId: string
  materialName: string
  materialId: string | null
  unit: string
  quantity: string
  note: string
}

const emptyDraft: StockDraft = { workshopId: '', materialName: '', materialId: null, unit: '', quantity: '', note: '' }

export default function Inventory() {
  const session = useApp((s) => s.session)

  const [tab, setTab] = useState<Tab>('stocks')
  const [stocks, setStocks] = useState<InventoryStockItem[] | null>(null)
  const [movements, setMovements] = useState<InventoryMovementItem[] | null>(null)
  const [error, setError] = useState(false)
  const [md, setMd] = useState<MasterData | null>(null)

  const [issueOpen, setIssueOpen] = useState(false)
  const [draft, setDraft] = useState<StockDraft>(emptyDraft)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [saving, setSaving] = useState(false)

  const canManage = (session?.permissions ?? []).includes('inventory.manage')

  const load = useCallback(async () => {
    setError(false)
    try {
      const [s, m] = await Promise.all([
        api.get<{ stocks: InventoryStockItem[] }>('/api/v1/inventory'),
        api.get<{ movements: InventoryMovementItem[] }>('/api/v1/inventory/movements?pageSize=30'),
      ])
      setStocks(s.stocks)
      setMovements(m.movements)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void load()
    api.get<MasterData>('/api/v1/master').then(setMd).catch(() => undefined)
  }, [load])

  const lowCount = (stocks ?? []).filter((s) => s.isLow).length

  async function submitMovement(direction: 'IN' | 'OUT') {
    const qty = Number(toEnDigits(draft.quantity).replace(/[^\d.]/g, ''))
    if (!draft.workshopId || !draft.materialName || !draft.unit || !(qty > 0)) {
      toast.error('کارگاه، مصالح، واحد و مقدار را کامل کنید.')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/v1/inventory/movements', {
        workshopId: draft.workshopId,
        materialId: draft.materialId,
        materialName: draft.materialName,
        unit: draft.unit,
        quantity: qty,
        direction,
        reason: direction === 'OUT' ? 'ISSUE' : 'RETURN',
        note: draft.note.trim() || null,
      })
      toast.success(direction === 'OUT' ? 'خروج از انبار ثبت شد.' : 'ورود به انبار ثبت شد.')
      setIssueOpen(false)
      setDraft(emptyDraft)
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    } finally {
      setSaving(false)
    }
  }

  const workshopOptions = (md?.workshops ?? []).map((w) => ({ id: w.id, label: w.name, hint: w.code }))
  const materialOptions = (md?.materials ?? []).map((m) => ({ id: m.id, label: m.name, hint: m.defaultUnit ?? undefined }))

  function onMaterialSelected(ids: string[]) {
    const m = (md?.materials ?? []).find((x) => x.id === ids[0])
    if (m) setDraft((d) => ({ ...d, materialId: m.id, materialName: m.name, unit: m.defaultUnit ?? '' }))
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="انبار کارگاه"
        subtitle={lowCount > 0 ? `${toFa(lowCount)} قلم کمبود موجودی دارد` : 'موجودی و گردش مصالح'}
        right={
          canManage ? (
            <Button size="sm" className="h-9 gap-1.5" onClick={() => { setDraft({ ...emptyDraft, workshopId: md?.workshops[0]?.id ?? '' }); setIssueOpen(true) }}>
              <ArrowUpFromLine className="size-4" />
              ثبت خروج
            </Button>
          ) : null
        }
      />

      {/* تب‌ها */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
          {(
            [
              { key: 'stocks', label: 'موجودی' },
              { key: 'movements', label: 'گردش‌ها' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-lg py-2 text-sm font-medium transition-colors',
                tab === t.key ? 'bg-card shadow-sm text-accent' : 'text-muted-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {error && tab === 'stocks' ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : tab === 'stocks' ? (
          stocks === null ? (
            <ListSkeleton rows={5} />
          ) : stocks.length === 0 ? (
            <EmptyState
              title="موجودی‌ای ثبت نشده است"
              hint="با «دریافت خرید» یا «تأیید انبار» ثبت‌های ورود مصالح، موجودی خودکار ساخته می‌شود."
              icon={<Package className="size-7" />}
            />
          ) : (
            <div className="space-y-2">
              {stocks.map((s) => (
                <div key={s.id} className={cn('rounded-xl border bg-card p-3.5', s.isLow ? 'border-red-200 bg-red-50/40' : 'border-border')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{s.materialName}</p>
                    <span className={cn('text-sm font-bold shrink-0 numeric-input', s.isLow ? 'text-red-600' : '')}>
                      {toFa(formatQty(s.quantity))} {s.unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-[11px] text-muted-foreground truncate">{s.workshopName}</span>
                    {s.isLow ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                        <AlertTriangle className="size-3" />
                        کمبود — حداقل {toFa(formatQty(s.minQuantity ?? 0))} {s.unit}
                      </span>
                    ) : s.minQuantity != null ? (
                      <span className="text-[10px] text-muted-foreground">حداقل: {toFa(formatQty(s.minQuantity))} {s.unit}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : movements === null ? (
          <ListSkeleton rows={5} />
        ) : movements.length === 0 ? (
          <EmptyState title="گردشی ثبت نشده است" icon={<ArrowDownToLine className="size-7" />} />
        ) : (
          <div className="space-y-2">
            {movements.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold',
                      m.direction === 'IN' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'
                    )}
                  >
                    {m.direction === 'IN' ? <ArrowDownToLine className="size-3" /> : <ArrowUpFromLine className="size-3" />}
                    {INVENTORY_DIRECTIONS[m.direction]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatRelative(m.createdAt)}</span>
                </div>
                <p className="text-sm font-medium mt-1.5 truncate">
                  {m.materialName} — <span className="numeric-input">{toFa(formatQty(m.quantity))} {m.unit}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {INVENTORY_REASONS[m.reason as keyof typeof INVENTORY_REASONS] ?? m.reason}
                  {m.workshopName ? ` · ${m.workshopName}` : ''}
                  {m.purchaseRequestNumber ? ` · خرید شمارهٔ ${toFa(m.purchaseRequestNumber)}` : ''}
                  {' · '}
                  {m.createdByName}
                </p>
                {m.note ? <p className="text-[11px] text-muted-foreground mt-1">{m.note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* فرم ثبت خروج/ورود دستی */}
      {issueOpen ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setIssueOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-4">ثبت گردش انبار</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => setSheet('workshop-out')} className="rounded-xl border border-border bg-card p-3 text-right min-h-14">
                  <span className="block text-[11px] text-muted-foreground mb-1">کارگاه</span>
                  <span className="block text-sm font-medium truncate">{md?.workshops.find((w) => w.id === draft.workshopId)?.name ?? 'انتخاب کنید'}</span>
                </button>
                <button type="button" onClick={() => setSheet('material-out')} className="rounded-xl border border-border bg-card p-3 text-right min-h-14">
                  <span className="block text-[11px] text-muted-foreground mb-1">مصالح</span>
                  <span className="block text-sm font-medium truncate">{draft.materialName || 'انتخاب کنید'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Input
                  value={draft.quantity}
                  onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                  placeholder="مقدار"
                  className="h-11 numeric-input bg-secondary/60"
                  inputMode="decimal"
                />
                <div className="rounded-xl border border-border bg-secondary/60 px-3 flex items-center text-sm min-h-11">
                  {draft.unit || 'واحد'}
                </div>
              </div>
              <Input
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="توضیح (اختیاری) — مثلاً مصرف سقف طبقهٔ دوم"
                className="h-11 bg-secondary/60"
                maxLength={300}
              />
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <Button
                  variant="outline"
                  className="h-12 border-orange-200 text-orange-700 hover:bg-orange-50"
                  onClick={() => void submitMovement('OUT')}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Minus className="size-4" />}
                  خروج (مصرف)
                </Button>
                <Button
                  variant="outline"
                  className="h-12 border-green-200 text-green-700 hover:bg-green-50"
                  onClick={() => void submitMovement('IN')}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  ورود / برگشت
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <SelectionSheet
        open={sheet === 'workshop-out'}
        onOpenChange={(v) => setSheet(v ? 'workshop-out' : null)}
        title="انتخاب کارگاه"
        options={workshopOptions}
        selected={[draft.workshopId]}
        onConfirm={(ids) => setDraft((d) => ({ ...d, workshopId: ids[0] ?? '' }))}
      />
      <SelectionSheet
        open={sheet === 'material-out'}
        onOpenChange={(v) => setSheet(v ? 'material-out' : null)}
        title="انتخاب مصالح"
        options={materialOptions}
        selected={draft.materialId ? [draft.materialId] : []}
        onConfirm={onMaterialSelected}
      />
    </div>
  )
}

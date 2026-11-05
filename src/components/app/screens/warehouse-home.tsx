"use client"

import { useCallback, useEffect, useState } from 'react'
import {
  ClipboardCheck,
  Package,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  BellRing,
  ListTodo,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type EntryListItem, type InventoryStockItem, type MasterData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, EmptyState, ErrorState, ListSkeleton, SelectionSheet, StatCard, DirectionBadge } from '@/components/app/shared'
import { toFa, formatQty, formatRelative } from '@/lib/fa'
import { DISCREPANCY_KINDS, STATUS_STYLES } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

// ─────────────────────────── پنل جداگانه انباردار ───────────────────────────
// صف تأیید انبار (ورود/خروج) + موجودی + اعلام کمبود/مغایرت — فقط کارگاه‌های تحت پوشش

interface WarehouseHomeData {
  id: string
  entryNumber: number
  status: string
  type: string
  direction: string
  workshopName: string
  supervisorName: string
  decidedByName: string | null
  itemsCount: number
  firstItem: { materialName: string; quantity: number; unit: string } | null
  submittedAt: string | null
  createdAt: string
}

interface DiscrepancyItem {
  id: string
  materialName: string
  unit: string
  kind: string
  status: string
  workshopName: string
  systemQty: number | null
  actualQty: number | null
  note: string | null
  createdByName: string
  createdAt: string
}

type DiscrepancySheet = null | { mode: 'pick' } | { mode: 'form'; stock: InventoryStockItem | null }

export default function WarehouseHome() {
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)
  const session = useApp((s) => s.session)
  const role = session?.user.role
  const canDeclare = (session?.permissions ?? []).includes('inventory.discrepancy')

  const [queue, setQueue] = useState<WarehouseHomeData[] | null>(null)
  const [stocks, setStocks] = useState<InventoryStockItem[]>([])
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([])
  const [md, setMd] = useState<MasterData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const [discOpen, setDiscOpen] = useState<DiscrepancySheet>(null)
  const [discDraft, setDiscDraft] = useState<{ kind: string; systemQty: string; actualQty: string; note: string }>({ kind: 'SHORTAGE', systemQty: '', actualQty: '', note: '' })
  const [discSaving, setDiscSaving] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      // صف تأیید انبار: ثبت‌های تأییدشدهٔ مدیر (در انتظار تأیید انبار) + تأییدشده‌های انبار (در انتظار تحویل)
      const [approved, confirmed, s, d, master] = await Promise.all([
        api.get<{ entries: EntryListItem[] }>('/api/v1/material-entries?status=APPROVED,LOCKED&pageSize=20'),
        api.get<{ entries: EntryListItem[] }>('/api/v1/material-entries?status=WAREHOUSE_CONFIRMED&pageSize=20'),
        api.get<{ stocks: InventoryStockItem[] }>('/api/v1/inventory'),
        api.get<{ discrepancies: DiscrepancyItem[] }>('/api/v1/inventory/discrepancies?status=OPEN'),
        api.get<MasterData>('/api/v1/master').catch(() => null),
      ])
      const mapEntry = (e: EntryListItem): WarehouseHomeData => ({
        id: e.id,
        entryNumber: e.entryNumber,
        status: e.status,
        type: e.type,
        direction: e.direction,
        workshopName: e.workshopName,
        supervisorName: e.supervisorName,
        decidedByName: e.decidedByName,
        itemsCount: e.items.length,
        firstItem: e.items[0] ? { materialName: e.items[0].materialName, quantity: e.items[0].quantity, unit: e.items[0].unit } : null,
        submittedAt: e.submittedAt,
        createdAt: e.createdAt,
      })
      setQueue([...approved.entries.map(mapEntry), ...confirmed.entries.map(mapEntry)])
      setStocks(s.stocks)
      setDiscrepancies(d.discrepancies)
      if (master) setMd(master)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pendingConfirm = (queue ?? []).filter((e) => e.status === 'APPROVED' || e.status === 'LOCKED').length
  const pendingDeliver = (queue ?? []).filter((e) => e.status === 'WAREHOUSE_CONFIRMED').length
  const lowCount = stocks.filter((s) => s.isLow).length

  async function declareDiscrepancy() {
    if (!discOpen || discOpen.mode !== 'form') return
    const stock = discOpen.stock
    if (!stock) {
      toast.error('خط موجودی را انتخاب کنید.')
      return
    }
    const toEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    const actual = discDraft.actualQty ? Number(toEn(discDraft.actualQty).replace(/[^\d.]/g, '')) : null
    setDiscSaving(true)
    try {
      await api.post('/api/v1/inventory/discrepancies', {
        workshopId: stock.workshopId,
        stockId: stock.id,
        materialName: stock.materialName,
        unit: stock.unit,
        systemQty: stock.quantity,
        actualQty: actual,
        kind: discDraft.kind,
        note: discDraft.note.trim() || null,
      })
      toast.success('اعلام ثبت شد — سرپرست کارگاه اعلان دریافت می‌کند.')
      setDiscOpen(null)
      setDiscDraft({ kind: 'SHORTAGE', systemQty: '', actualQty: '', note: '' })
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    } finally {
      setDiscSaving(false)
    }
  }

  async function resolveDiscrepancy(id: string) {
    try {
      await api.patch(`/api/v1/inventory/discrepancies/${id}`, { resolveNote: null })
      toast.success('برطرف شد.')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    }
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="پنل انبار"
        subtitle={md?.workshops.map((w) => w.name).join('، ') || 'مدیریت ورود/خروج و موجودی انبار'}
        onBack={back}
      />

      <div className="p-4 space-y-4">
        {/* کارت‌های آماری */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="در انتظار تأیید انبار" value={toFa(pendingConfirm)} dotColor="bg-amber-500" />
          <StatCard label="در انتظار تحویل" value={toFa(pendingDeliver)} dotColor="bg-teal-500" />
          <StatCard label="قلم کمبود" value={toFa(lowCount)} dotColor="bg-red-500" />
        </div>

        {/* اکشن‌های سریع — جریان یکپارچه ثبت ورود/خروج (نیازمند ۷: همان مسیر سرپرستان) */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => navigate('entry-project-select', { direction: 'IN' })}
            className="rounded-xl border border-border bg-card p-3.5 text-right active:scale-[0.99] transition-transform"
          >
            <ArrowDownToLine className="size-5 text-green-600 mb-1.5" />
            <span className="block text-sm font-medium">ثبت ورود مصالح</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">همان فرم سرپرستان — با انتخاب پروژه</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('entry-project-select', { direction: 'OUT' })}
            className="rounded-xl border border-border bg-card p-3.5 text-right active:scale-[0.99] transition-transform"
          >
            <ArrowUpFromLine className="size-5 text-orange-600 mb-1.5" />
            <span className="block text-sm font-medium">ثبت خروج مصالح</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">خروج از انبار پروژهٔ انتخاب‌شده</span>
          </button>
          {canDeclare ? (
            <button
              type="button"
              onClick={() => {
                setDiscDraft({ kind: 'SHORTAGE', systemQty: '', actualQty: '', note: '' })
                setDiscOpen({ mode: 'pick' })
              }}
              className="rounded-xl border border-border bg-card p-3.5 text-right active:scale-[0.99] transition-transform"
            >
              <AlertTriangle className="size-5 text-orange-500 mb-1.5" />
              <span className="block text-sm font-medium">اعلام کمبود / مغایرت</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">برای سرپرست کارگاه ارسال می‌شود</span>
            </button>
          ) : null}
          {/* Item ۶ — دسترسی انباردار به وظایف روزانهٔ محول‌شده (همان مسیر سرپرستان) */}
          <button
            type="button"
            onClick={() => navigate('daily-tasks')}
            className="rounded-xl border border-border bg-card p-3.5 text-right active:scale-[0.99] transition-transform"
          >
            <ListTodo className="size-5 text-blue-600 mb-1.5" />
            <span className="block text-sm font-medium">وظایف روزانه</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">مشاهده و تکمیل وظایف محول‌شده</span>
          </button>
          {/* Item ۴ — ثبت گزارش روزانه توسط انباردار (همان فرم سایر نقش‌ها) */}
          <button
            type="button"
            onClick={() => navigate('daily-report-form')}
            className="rounded-xl border border-border bg-card p-3.5 text-right active:scale-[0.99] transition-transform"
          >
            <FileText className="size-5 text-violet-600 mb-1.5" />
            <span className="block text-sm font-medium">ثبت گزارش روزانه</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">گزارش کار روز خود را ثبت کنید</span>
          </button>
        </div>

        {/* صف تأیید انبار */}
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <ClipboardCheck className="size-4 text-accent" />
            صف تأیید انبار
          </h2>
          {loading && queue === null ? (
            <ListSkeleton rows={3} />
          ) : error && queue === null ? (
            <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
          ) : (queue ?? []).length === 0 ? (
            <EmptyState title="صف تأیید خالی است" hint="ثبت‌های تأییدشدهٔ مدیر برای تأیید انبار اینجا نمایش داده می‌شوند." icon={<ClipboardCheck className="size-7" />} />
          ) : (
            <div className="space-y-2">
              {(queue ?? []).map((e) => {
                const style = STATUS_STYLES[e.status] ?? STATUS_STYLES.DRAFT
                const isConfirm = e.status === 'APPROVED' || e.status === 'LOCKED'
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => navigate('entry-detail', { id: e.id })}
                    className="w-full rounded-xl border border-border bg-card p-3.5 text-right active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium', style.badge)}>
                        <span className={cn('size-1.5 rounded-full', style.dot)} />
                        {style.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">ثبت شمارهٔ {toFa(e.entryNumber)}</span>
                    </div>
                    <p className="text-sm font-medium mt-1.5 truncate">
                      {e.firstItem ? `${e.firstItem.materialName} — ${toFa(formatQty(e.firstItem.quantity))} ${e.firstItem.unit}` : `${toFa(e.itemsCount)} قلم مصالح`}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                      <span>{e.workshopName}</span>
                      <span>· {e.supervisorName}</span>
                      {e.submittedAt ? <span>· {formatRelative(e.submittedAt)}</span> : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                      <DirectionBadge direction={e.direction} />
                      <span>· {e.direction === 'OUT' ? 'خروج' : 'ورود'} ثبت‌شده</span>
                      {e.decidedByName ? <span>· تأییدکننده: {e.decidedByName}</span> : null}
                    </p>
                    <span className={cn('mt-2 inline-flex items-center gap-1 text-xs font-medium', isConfirm ? 'text-amber-600' : 'text-teal-600')}>
                      {isConfirm ? (e.direction === 'OUT' ? 'تأیید خروج در انبار' : 'تأیید ورود در انبار') : 'ثبت تحویل'}
                      <ChevronLeft className="size-3.5" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* مغایرت‌های باز */}
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <BellRing className="size-4 text-orange-500" />
            اعلام‌های کمبود / مغایرت
          </h2>
          {discrepancies.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-3">اعلام بازی وجود ندارد.</p>
          ) : (
            <div className="space-y-2">
              {discrepancies.map((d) => (
                <div key={d.id} className="rounded-xl border border-orange-200 bg-orange-50/50 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-orange-700">{DISCREPANCY_KINDS[d.kind as keyof typeof DISCREPANCY_KINDS] ?? d.kind}</span>
                    <span className="text-[10px] text-muted-foreground">{formatRelative(d.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium mt-1">
                    {d.materialName}
                    {d.systemQty != null && d.actualQty != null ? (
                      <span className="text-xs text-muted-foreground font-normal">
                        {' '}
                        — دفتری {toFa(formatQty(d.systemQty))} / فیزیکی {toFa(formatQty(d.actualQty))} {d.unit}
                      </span>
                    ) : null}
                  </p>
                  {d.note ? <p className="text-[11px] text-muted-foreground mt-1">{d.note}</p> : null}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground">
                      {d.workshopName} · {d.createdByName}
                    </span>
                    {role !== 'WAREHOUSE_KEEPER' ? (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void resolveDiscrepancy(d.id)}>
                        <CheckCircle2 className="size-3.5" />
                        برطرف شد
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* موجودی خلاصه */}
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Package className="size-4 text-accent" />
            موجودی انبار
          </h2>
          {stocks.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-3">موجودی‌ای ثبت نشده است.</p>
          ) : (
            <div className="space-y-1.5">
              {stocks.slice(0, 6).map((s) => (
                <div key={s.id} className={cn('rounded-xl border p-3 flex items-center justify-between gap-2 bg-card', s.isLow ? 'border-red-200 bg-red-50/40' : 'border-border')}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.materialName}</p>
                    <p className="text-[10px] text-muted-foreground">{s.workshopName}</p>
                  </div>
                  <span className={cn('text-sm font-bold shrink-0', s.isLow ? 'text-red-600' : '')}>
                    {toFa(formatQty(s.quantity))} {s.unit}
                  </span>
                </div>
              ))}
              {stocks.length > 6 ? (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate('inventory')}>
                  مشاهده همهٔ موجودی
                </Button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* شیت اعلام مغایرت — انتخاب خط موجودی */}
      <SelectionSheet
        open={discOpen?.mode === 'pick'}
        onOpenChange={(v) =>
          setDiscOpen((cur) =>
            v ? { mode: 'pick' } : cur?.mode === 'form' ? cur : null
          )
        }
        title="انتخاب خط موجودی"
        options={stocks.map((s) => ({ id: s.id, label: s.materialName, hint: `${s.workshopName} — ${formatQty(s.quantity)} ${s.unit}` }))}
        selected={[]}
        onConfirm={(ids) => {
          const stock = stocks.find((s) => s.id === ids[0]) ?? null
          setDiscOpen(stock ? { mode: 'form', stock } : null)
        }}
      />

      {/* شیت اعلام مغایرت — فرم */}
      {discOpen?.mode === 'form' ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setDiscOpen(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-1">اعلام کمبود / مغایرت</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {discOpen.stock?.materialName} — موجودی دفتری: {toFa(formatQty(discOpen.stock?.quantity ?? 0))} {discOpen.stock?.unit}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">نوع اعلام</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(DISCREPANCY_KINDS) as Array<keyof typeof DISCREPANCY_KINDS>).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDiscDraft((d) => ({ ...d, kind: k }))}
                      className={cn(
                        'rounded-lg border py-2.5 text-xs font-medium transition-colors',
                        discDraft.kind === k ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
                      )}
                    >
                      {DISCREPANCY_KINDS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">موجودی فیزیکی (شمارش واقعی)</label>
                <Input
                  value={discDraft.actualQty}
                  onChange={(e) => setDiscDraft((d) => ({ ...d, actualQty: e.target.value }))}
                  placeholder={`مثلاً: ${discOpen.stock ? Math.max(0, Math.floor(discOpen.stock.quantity / 2)) : 0}`}
                  className="h-11 numeric-input bg-secondary/60"
                  inputMode="decimal"
                />
              </div>
              <Textarea
                value={discDraft.note}
                onChange={(e) => setDiscDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="توضیح — مثلاً: ۵ کیسه آسیب‌دیده و قابل استفاده نیست…"
                rows={3}
                maxLength={500}
                className="bg-secondary/60 leading-7"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-5">
              <Button variant="outline" onClick={() => setDiscOpen(null)} className="h-12 rounded-xl">
                انصراف
              </Button>
              <Button
                onClick={() => void declareDiscrepancy()}
                disabled={discSaving}
                className="h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
              >
                {discSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                ثبت و اعلان به سرپرست
              </Button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}

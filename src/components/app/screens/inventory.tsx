"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Package, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, SlidersHorizontal, CheckCircle2, Search, X, CalendarDays } from 'lucide-react'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ClientApiError, type InventoryStockItem, type InventoryMovementItem } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, EmptyState, ErrorState, ListSkeleton } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { toFa, formatQty, formatRelative, formatJalaliFromISO } from '@/lib/fa'
import { INVENTORY_REASONS, INVENTORY_DIRECTIONS, DISCREPANCY_KINDS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

type Tab = 'stocks' | 'movements' | 'discrepancies'
type ManageKind = null | { stock: InventoryStockItem; mode: 'adjust' } | { stock: InventoryStockItem; mode: 'min' }

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

const DIR_FILTERS = [
  { key: 'ALL', label: 'همه' },
  { key: 'IN', label: 'ورود' },
  { key: 'OUT', label: 'خروج' },
] as const

export default function Inventory() {
  const session = useApp((s) => s.session)
  const role = session?.user.role
  const navigate = useApp((s) => s.navigate)

  // انبارهای قابل‌مشاهدهٔ کاربر — مدیر همهٔ انبارها را تب‌به‌تب می‌بیند (نیازمند ۲)
  const workshops = session?.workshops ?? []

  const [tab, setTab] = useState<Tab>('stocks')
  const [wsFilter, setWsFilter] = useState<string>(() => (workshops.length === 1 ? workshops[0].id : 'ALL'))
  const [q, setQ] = useState('')
  const [dir, setDir] = useState<string>('ALL')
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  const [dateSheet, setDateSheet] = useState<null | 'from' | 'to'>(null)

  const [stocks, setStocks] = useState<InventoryStockItem[] | null>(null)
  const [movements, setMovements] = useState<InventoryMovementItem[] | null>(null)
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[] | null>(null)
  const [error, setError] = useState(false)

  const [manage, setManage] = useState<ManageKind>(null)
  const [manageQty, setManageQty] = useState('')
  const [manageNote, setManageNote] = useState('')
  const [manageSaving, setManageSaving] = useState(false)

  const canManage = (session?.permissions ?? []).includes('inventory.manage')

  // کاربر تک‌کارگاهی — همان کارگاه به‌صورت پیش‌فرض انتخاب می‌شود
  useEffect(() => {
    if (workshops.length === 1 && !workshops.some((w) => w.id === wsFilter)) setWsFilter(workshops[0].id)
  }, [workshops, wsFilter])

  // فیلترهای انبار: کارگاه + نام مصالح (+ جهت و بازهٔ تاریخ برای گردش‌ها) — نیازمند ۱
  const load = useCallback(async () => {
    setError(false)
    const wq = wsFilter === 'ALL' ? '' : `workshopId=${encodeURIComponent(wsFilter)}`
    const qq = q.trim() ? `q=${encodeURIComponent(q.trim())}` : ''
    const common = [wq, qq].filter(Boolean).join('&')
    const mvQ = [
      common,
      dir === 'ALL' ? '' : `direction=${dir}`,
      from ? `from=${from}` : '',
      to ? `to=${to}` : '',
    ]
      .filter(Boolean)
      .join('&')
    try {
      const [s, m, d] = await Promise.all([
        api.get<{ stocks: InventoryStockItem[] }>(`/api/v1/inventory${common ? `?${common}` : ''}`),
        api.get<{ movements: InventoryMovementItem[] }>(`/api/v1/inventory/movements?pageSize=50${mvQ ? `&${mvQ}` : ''}`),
        api
          .get<{ discrepancies: DiscrepancyItem[] }>(`/api/v1/inventory/discrepancies${common ? `?${common}` : ''}`)
          .catch(() => ({ discrepancies: [] as DiscrepancyItem[] })),
      ])
      setStocks(s.stocks)
      setMovements(m.movements)
      setDiscrepancies(d.discrepancies)
    } catch {
      setError(true)
    }
  }, [wsFilter, q, dir, from, to])

  // بارگذاری اولیهٔ بی‌درنگ؛ تغییر فیلترها با تأخیر کوتاه (debounce) اجرا می‌شود
  const firstLoad = useRef(true)
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      void load()
      return
    }
    const t = setTimeout(() => void load(), 300)
    return () => clearTimeout(t)
  }, [load])

  const lowCount = (stocks ?? []).filter((s) => s.isLow).length
  const showWsTabs = workshops.length > 1
  const hasDateFilter = !!from || !!to

  async function submitManage() {
    if (!manage) return
    setManageSaving(true)
    try {
      if (manage.mode === 'adjust') {
        const qty = Number(toEnDigits(manageQty).replace(/[^\d.]/g, ''))
        if (!(qty >= 0)) {
          toast.error('مقدار معتبر وارد کنید.')
          setManageSaving(false)
          return
        }
        await api.patch(`/api/v1/inventory/stocks/${manage.stock.id}`, { quantity: qty, note: manageNote.trim() || null })
        toast.success('موجودی به‌روزرسانی شد — گردش تعدیل ثبت شد.')
      } else {
        const min = manageQty.trim() === '' ? null : Number(toEnDigits(manageQty).replace(/[^\d.]/g, ''))
        await api.patch(`/api/v1/inventory/stocks/${manage.stock.id}`, { minQuantity: min })
        toast.success('حداقل موجودی ذخیره شد.')
      }
      setManage(null)
      setManageQty('')
      setManageNote('')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    } finally {
      setManageSaving(false)
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
        title="انبار کارگاه"
        subtitle={lowCount > 0 ? `${toFa(lowCount)} قلم کمبود موجودی دارد` : 'موجودی و گردش مصالح'}
      />

      {/* ثبت ورود/خروج — جریان یکپارچه (همان مسیر سرپرستان) — نیازمند ۵ و ۷ */}
      {canManage ? (
        <div className="px-4 pt-3 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-11 border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => navigate('entry-project-select', { direction: 'IN' })}
          >
            <ArrowDownToLine className="size-4" />
            ثبت ورود مصالح
          </Button>
          <Button
            variant="outline"
            className="h-11 border-orange-200 text-orange-700 hover:bg-orange-50"
            onClick={() => navigate('entry-project-select', { direction: 'OUT' })}
          >
            <ArrowUpFromLine className="size-4" />
            ثبت خروج مصالح
          </Button>
        </div>
      ) : null}

      {/* تب‌های انبار — هر انبار محتوای خودش را دارد (نیازمند ۲) */}
      {showWsTabs ? (
        <div className="px-4 pt-3">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {[{ id: 'ALL', name: 'همه انبارها' }, ...workshops].map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWsFilter(w.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors',
                  wsFilter === w.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-card border-border text-muted-foreground'
                )}
              >
                {w.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* تب‌های محتوا */}
      <div className="px-4 pt-3">
        <div className={cn('grid gap-1 rounded-xl bg-secondary p-1', canManage ? 'grid-cols-3' : 'grid-cols-2')}>
          {(
            [
              { key: 'stocks', label: 'موجودی' },
              { key: 'movements', label: 'گردش‌ها' },
              ...(canManage ? [{ key: 'discrepancies' as const, label: 'اعلام‌ها' }] : []),
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

      {/* جستجوی نام مصالح (نیازمند ۱) */}
      <div className="px-4 pt-3 relative">
        <Search className="size-4 absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی نام مصالح…"
          className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 pl-10 text-sm outline-none"
          inputMode="search"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute left-7 top-1/2 -translate-y-1/2"
            aria-label="پاک کردن"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      {/* فیلتر جهت + بازهٔ تاریخ — فقط برای گردش‌ها (نیازمند ۱) */}
      {tab === 'movements' ? (
        <div className="px-4 pt-2.5 flex gap-2 overflow-x-auto no-scrollbar">
          {DIR_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setDir(f.key)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors',
                dir === f.key ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-card border-border text-muted-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDateFilterOpen(true)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors inline-flex items-center gap-1.5',
              hasDateFilter ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
            )}
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
      ) : null}

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
                    <div className="flex items-center gap-2">
                      {s.isLow ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                          <AlertTriangle className="size-3" />
                          کمبود — حداقل {toFa(formatQty(s.minQuantity ?? 0))} {s.unit}
                        </span>
                      ) : s.minQuantity != null ? (
                        <span className="text-[10px] text-muted-foreground">حداقل: {toFa(formatQty(s.minQuantity))} {s.unit}</span>
                      ) : null}
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => {
                            setManage({ stock: s, mode: 'adjust' })
                            setManageQty(String(s.quantity))
                            setManageNote('')
                          }}
                          className="size-8 rounded-lg flex items-center justify-center text-accent hover:bg-secondary shrink-0"
                          aria-label="مدیریت موجودی"
                        >
                          <SlidersHorizontal className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'movements' ? (
          movements === null ? (
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
                    {m.projectName ? ` · پروژه: ${m.projectName}` : ''}
                    {m.purchaseRequestNumber ? ` · خرید شمارهٔ ${toFa(m.purchaseRequestNumber)}` : ''}
                    {' · '}
                    {m.createdByName}
                  </p>
                  {m.note ? <p className="text-[11px] text-muted-foreground mt-1">{m.note}</p> : null}
                </div>
              ))}
            </div>
          )
        ) : discrepancies === null ? (
          <ListSkeleton rows={4} />
        ) : discrepancies.length === 0 ? (
          <EmptyState title="اعلام کمبود/مغایرتی ثبت نشده است" icon={<AlertTriangle className="size-7" />} />
        ) : (
          <div className="space-y-2">
            {discrepancies.map((d) => (
              <div key={d.id} className={cn('rounded-xl border p-3.5', d.status === 'OPEN' ? 'border-orange-200 bg-orange-50/50' : 'border-border bg-card opacity-70')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-orange-700">
                    {DISCREPANCY_KINDS[d.kind as keyof typeof DISCREPANCY_KINDS] ?? d.kind}
                    {d.status === 'RESOLVED' ? ' — برطرف شد' : ''}
                  </span>
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
                  {d.status === 'OPEN' && role !== 'WAREHOUSE_KEEPER' ? (
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
      </div>

      {/* شیت فیلتر تاریخ گردش‌ها */}
      <Drawer.Root open={dateFilterOpen} onOpenChange={setDateFilterOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <Drawer.Title className="font-semibold px-5 pt-3">فیلتر بازهٔ تاریخ</Drawer.Title>
            <p className="text-xs text-muted-foreground px-5 pb-3">تقویم شمسی — بازهٔ گردش انبار را انتخاب کنید</p>

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
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setFrom(null)
                  setTo(null)
                  setDateFilterOpen(false)
                }}
              >
                پاک کردن
              </Button>
              <Button className="flex-1" onClick={() => setDateFilterOpen(false)}>
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

      {/* شیت تعدیل موجودی / حداقل */}
      {manage ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setManage(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setManage({ stock: manage.stock, mode: 'adjust' })}
                className={cn('rounded-lg border py-2 text-xs font-medium', manage.mode === 'adjust' ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground')}
              >
                تغییر موجودی
              </button>
              <button
                type="button"
                onClick={() => {
                  setManage({ stock: manage.stock, mode: 'min' })
                  setManageQty(manage.stock.minQuantity != null ? String(manage.stock.minQuantity) : '')
                }}
                className={cn('rounded-lg border py-2 text-xs font-medium', manage.mode === 'min' ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground')}
              >
                حداقل موجودی
              </button>
            </div>
            <p className="text-sm font-medium">{manage.stock.materialName}</p>
            <p className="text-[11px] text-muted-foreground mb-3">
              {manage.stock.workshopName} — موجودی فعلی: {toFa(formatQty(manage.stock.quantity))} {manage.stock.unit}
            </p>
            <Input
              value={manageQty}
              onChange={(e) => setManageQty(e.target.value)}
              placeholder={manage.mode === 'adjust' ? 'موجودی واقعی (شمارش)' : 'حداقل موجودی (اختیاری)'}
              className="h-11 numeric-input bg-secondary/60 mb-2"
              inputMode="decimal"
            />
            {manage.mode === 'adjust' ? (
              <Input
                value={manageNote}
                onChange={(e) => setManageNote(e.target.value)}
                placeholder="دلیل تعدیل (اختیاری)"
                className="h-11 bg-secondary/60"
                maxLength={300}
              />
            ) : null}
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <Button variant="outline" onClick={() => setManage(null)} className="h-12 rounded-xl">
                انصراف
              </Button>
              <Button onClick={() => void submitManage()} disabled={manageSaving} className="h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
                {manageSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                ذخیره
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

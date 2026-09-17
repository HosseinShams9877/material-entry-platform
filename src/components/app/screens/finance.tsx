"use client"

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Wallet, AlertTriangle, HandCoins, ReceiptText, TrendingUp, Pencil, Trash2, CheckCircle2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ClientApiError, type MasterData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, EmptyState, ErrorState, ListSkeleton, SelectionSheet } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { toFa, toEnDigits, formatJalaliFromISO, formatJalaliTehran, formatJalaliDateTime, todayISO } from '@/lib/fa'
import { PAYMENT_METHODS, RECEIVABLE_STATUS_STYLES } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

// ─────────────────────────── صفحهٔ مالی — پرداخت، سررسید و بدهی (سند سیستم یکپارچه) ───────────────────────────

function toEn(s: string): string {
  return toEnDigits(s).replace(/[^\d.]/g, '')
}

function faMoney(amount: string | null | undefined): string {
  if (!amount) return '—'
  const n = BigInt(amount)
  return toFa(n.toLocaleString('en-US')).replace(/,/g, '٬')
}

interface DebtItem {
  id: string
  number: number
  status: string
  supplierName: string | null
  workshopName: string
  projectName: string | null
  totalAmount: string
  paidAmount: string
  remainingAmount: string
  dueDate: string | null
  paymentTerms: string | null
  isOverdue: boolean
  paymentsCount: number
}

interface PaymentItem {
  id: string
  amount: string
  paidAt: string
  method: string
  referenceNo: string | null
  note: string | null
  createdByName: string
  purchaseNumber: number
  supplierName: string | null
  workshopName: string
}

interface ReceivableItem {
  id: string
  title: string
  amount: string
  workshopName: string
  projectName: string | null
  dueDate: string | null
  status: string
  isOverdue: boolean
  note: string | null
  createdByName: string
}

interface SummaryData {
  totals: {
    purchasesCount: number
    purchasesTotal: string
    paidTotal: string
    debtTotal: string
    overdueCount: number
    overdueTotal: string
    receivablesOpenCount: number
    receivablesOpenAmount: string
    receivablesOverdue: number
  }
  debts: DebtItem[]
  recentPayments: Array<PaymentItem & { purchaseId: string }>
}

type Tab = 'debts' | 'payments' | 'receivables'

export default function Finance() {
  const session = useApp((s) => s.session)

  const [tab, setTab] = useState<Tab>('debts')
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [payments, setPayments] = useState<PaymentItem[] | null>(null)
  const [receivables, setReceivables] = useState<ReceivableItem[] | null>(null)
  const [error, setError] = useState(false)
  const [md, setMd] = useState<MasterData | null>(null)

  const canManage = (session?.permissions ?? []).includes('finance.manage')

  const load = useCallback(async () => {
    setError(false)
    try {
      const [s, p, r] = await Promise.all([
        api.get<SummaryData>('/api/v1/finance/summary'),
        api.get<{ payments: PaymentItem[] }>('/api/v1/finance/payments?pageSize=30'),
        api.get<{ receivables: ReceivableItem[] }>('/api/v1/finance/receivables'),
      ])
      setSummary(s)
      setPayments(p.payments)
      setReceivables(r.receivables)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void load()
    api.get<MasterData>('/api/v1/master').then(setMd).catch(() => undefined)
  }, [load])

  // ── ثبت پرداخت ──
  const [payTarget, setPayTarget] = useState<DebtItem | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [payMethod, setPayMethod] = useState<string>('TRANSFER')
  const [payRef, setPayRef] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payDateSheet, setPayDateSheet] = useState(false)
  const [paySaving, setPaySaving] = useState(false)

  function openPaySheet(d: DebtItem) {
    setPayTarget(d)
    setPayAmount(d.remainingAmount)
    setPayDate(todayISO())
    setPayMethod('TRANSFER')
    setPayRef('')
    setPayNote('')
  }

  async function submitPayment() {
    if (!payTarget) return
    const amt = BigInt(Math.round(Number(toEn(payAmount) || '0')))
    if (amt <= 0n) {
      toast.error('مبلغ پرداخت را وارد کنید.')
      return
    }
    setPaySaving(true)
    try {
      await api.post('/api/v1/finance/payments', {
        purchaseId: payTarget.id,
        amount: Number(amt),
        paidAt: payDate || todayISO(),
        method: payMethod,
        referenceNo: payRef.trim() || null,
        note: payNote.trim() || null,
      })
      toast.success('پرداخت ثبت شد.')
      setPayTarget(null)
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    } finally {
      setPaySaving(false)
    }
  }

  // ── ویرایش سررسید/شرایط پرداخت ──
  const [dueTarget, setDueTarget] = useState<DebtItem | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [dueTerms, setDueTerms] = useState('')
  const [dueDateSheet, setDueDateSheet] = useState(false)
  const [dueSaving, setDueSaving] = useState(false)

  function openDueSheet(d: DebtItem) {
    setDueTarget(d)
    setDueDate(d.dueDate ? d.dueDate.slice(0, 10) : '')
    setDueTerms(d.paymentTerms ?? '')
  }

  async function submitDue() {
    if (!dueTarget) return
    setDueSaving(true)
    try {
      await api.patch(`/api/v1/purchase-requests/${dueTarget.id}/payment-info`, {
        dueDate: dueDate || null,
        paymentTerms: dueTerms.trim() || null,
      })
      toast.success('سررسید به‌روزرسانی شد.')
      setDueTarget(null)
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    } finally {
      setDueSaving(false)
    }
  }

  // ── ثبت طلب ──
  const [recOpen, setRecOpen] = useState(false)
  const [recTitle, setRecTitle] = useState('')
  const [recAmount, setRecAmount] = useState('')
  const [recWorkshop, setRecWorkshop] = useState('')
  const [recProjectId, setRecProjectId] = useState('')
  const [recDate, setRecDate] = useState('')
  const [recNote, setRecNote] = useState('')
  const [recDateSheet, setRecDateSheet] = useState(false)
  const [recSheet, setRecSheet] = useState<'workshop' | 'project' | null>(null)
  const [recSaving, setRecSaving] = useState(false)

  async function submitReceivable() {
    const amt = Number(toEn(recAmount) || '0')
    if (!recWorkshop || recTitle.trim().length < 3 || !(amt > 0)) {
      toast.error('کارگاه، شرح طلب و مبلغ را کامل کنید.')
      return
    }
    setRecSaving(true)
    try {
      await api.post('/api/v1/finance/receivables', {
        workshopId: recWorkshop,
        projectId: recProjectId || null,
        title: recTitle.trim(),
        amount: amt,
        dueDate: recDate || null,
        note: recNote.trim() || null,
      })
      toast.success('طلب ثبت شد.')
      setRecOpen(false)
      setRecTitle(''); setRecAmount(''); setRecDate(''); setRecNote(''); setRecProjectId('')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    } finally {
      setRecSaving(false)
    }
  }

  async function settleReceivable(r: ReceivableItem) {
    try {
      await api.patch(`/api/v1/finance/receivables/${r.id}`, { status: r.status === 'OPEN' ? 'SETTLED' : 'OPEN' })
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    }
  }

  async function deleteReceivable(r: ReceivableItem) {
    try {
      await api.del(`/api/v1/finance/receivables/${r.id}`)
      toast.success('طلب حذف شد.')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error(ERROR_MSG)
    }
  }

  const totals = summary?.totals
  const workshopOptions = (md?.workshops ?? []).map((w) => ({ id: w.id, label: w.name, hint: w.code }))
  const projectOptions = (md?.projects ?? [])
    .filter((p) => !recWorkshop || p.workshopId === recWorkshop)
    .map((p) => ({ id: p.id, label: p.name }))

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="مالی"
        subtitle="پرداخت‌ها، سررسید و بدهی تأمین‌کنندگان"
        right={
          canManage ? (
            <Button size="sm" className="h-9 gap-1.5" onClick={() => { setRecWorkshop(md?.workshops[0]?.id ?? ''); setRecOpen(true) }}>
              <TrendingUp className="size-4" />
              ثبت طلب
            </Button>
          ) : null
        }
      />

      {/* کارت‌های خلاصه */}
      <div className="p-4 pb-0">
        {error ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : !totals ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-[11px] text-muted-foreground mb-1">بدهی به تأمین‌کنندگان</p>
              <p className="text-lg font-bold numeric-input">{faMoney(totals.debtTotal)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">تومان</p>
            </div>
            <div className={cn('rounded-xl border p-3.5', totals.overdueCount > 0 ? 'border-red-200 bg-red-50/50' : 'border-border bg-card')}>
              <p className="text-[11px] text-muted-foreground mb-1">سررسید گذشته</p>
              <p className={cn('text-lg font-bold numeric-input', totals.overdueCount > 0 && 'text-red-600')}>
                {toFa(totals.overdueCount)} مورد
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 numeric-input">{faMoney(totals.overdueTotal)} تومان</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-[11px] text-muted-foreground mb-1">پرداخت‌شده (کل)</p>
              <p className="text-lg font-bold text-green-600 numeric-input">{faMoney(totals.paidTotal)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">تومان</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-[11px] text-muted-foreground mb-1">طلب باز از کارفرما</p>
              <p className="text-lg font-bold text-amber-600 numeric-input">{faMoney(totals.receivablesOpenAmount)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{toFa(totals.receivablesOpenCount)} مورد</p>
            </div>
          </div>
        )}
      </div>

      {/* تب‌ها */}
      <div className="px-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
          {(
            [
              { key: 'debts', label: 'بدهی‌ها' },
              { key: 'payments', label: 'پرداخت‌ها' },
              { key: 'receivables', label: 'دریافت‌ها' },
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
        {/* بدهی‌ها */}
        {tab === 'debts' ? (
          summary === null && !error ? (
            <ListSkeleton rows={5} />
          ) : (summary?.debts ?? []).length === 0 ? (
            <EmptyState title="بدهی بازی وجود ندارد" hint="خریدهای دارای مبلغ ثبت‌شده اینجا دیده می‌شوند." icon={<Wallet className="size-7" />} />
          ) : (
            <div className="space-y-2">
              {(summary?.debts ?? []).map((d) => (
                <div key={d.id} className={cn('rounded-xl border bg-card p-3.5', d.isOverdue ? 'border-red-200 bg-red-50/40' : 'border-border')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        خرید شمارهٔ {toFa(d.number)}
                        {d.supplierName ? ` — ${d.supplierName}` : ''}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{d.workshopName}{d.projectName ? ` · ${d.projectName}` : ''}</p>
                    </div>
                    {d.isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5 shrink-0">
                        <AlertTriangle className="size-3" />
                        سررسید گذشته
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                    <div className="rounded-lg bg-secondary/70 py-1.5">
                      <p className="text-[10px] text-muted-foreground">مبلغ کل</p>
                      <p className="text-xs font-bold numeric-input">{faMoney(d.totalAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/70 py-1.5">
                      <p className="text-[10px] text-muted-foreground">پرداخت‌شده</p>
                      <p className="text-xs font-bold text-green-600 numeric-input">{faMoney(d.paidAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 py-1.5">
                      <p className="text-[10px] text-muted-foreground">مانده</p>
                      <p className="text-xs font-bold text-red-600 numeric-input">{faMoney(d.remainingAmount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2.5">
                    <p className="text-[10px] text-muted-foreground truncate">
                      {d.dueDate ? `سررسید: ${formatJalaliTehran(d.dueDate)}` : 'بدون سررسید'}
                      {d.paymentTerms ? ` · ${d.paymentTerms}` : ''}
                    </p>
                    {canManage ? (
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px]" onClick={() => openDueSheet(d)}>
                          <Pencil className="size-3.5" />
                          سررسید
                        </Button>
                        <Button size="sm" className="h-8 px-2.5 text-[11px] gap-1" onClick={() => openPaySheet(d)}>
                          <HandCoins className="size-3.5" />
                          پرداخت
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}

        {/* پرداخت‌ها */}
        {tab === 'payments' ? (
          payments === null && !error ? (
            <ListSkeleton rows={5} />
          ) : (payments ?? []).length === 0 ? (
            <EmptyState title="پرداختی ثبت نشده است" hint="از تب «بدهی‌ها» روی هر خرید دکمهٔ پرداخت را بزنید." icon={<ReceiptText className="size-7" />} />
          ) : (
            <div className="space-y-2">
              {(payments ?? []).map((p) => (
                <div key={p.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-green-600 numeric-input">{faMoney(p.amount)} <span className="text-[10px] font-normal text-muted-foreground">تومان</span></p>
                    <span className="text-[10px] text-muted-foreground">{formatJalaliDateTime(p.paidAt, false)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">
                    خرید شمارهٔ {toFa(p.purchaseNumber)}{p.supplierName ? ` · ${p.supplierName}` : ''} · {p.workshopName}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] ?? p.method}
                    {p.referenceNo ? ` · پیگیری: ${toFa(p.referenceNo)}` : ''}
                    {' · '}
                    {p.createdByName}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : null}

        {/* دریافت‌ها (طلب) */}
        {tab === 'receivables' ? (
          receivables === null && !error ? (
            <ListSkeleton rows={4} />
          ) : (receivables ?? []).length === 0 ? (
            <EmptyState title="طلبی ثبت نشده است" hint="مبالغ قابل‌دریافت از کارفرما را با دکمهٔ «ثبت طلب» اضافه کنید." icon={<TrendingUp className="size-7" />} />
          ) : (
            <div className="space-y-2">
              {(receivables ?? []).map((r) => {
                const st = RECEIVABLE_STATUS_STYLES[r.status] ?? RECEIVABLE_STATUS_STYLES.OPEN
                return (
                  <div key={r.id} className={cn('rounded-xl border bg-card p-3.5', r.isOverdue ? 'border-amber-300' : 'border-border')}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0', st.badge)}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-sm font-bold mt-1.5 numeric-input">{faMoney(r.amount)} <span className="text-[10px] font-normal text-muted-foreground">تومان</span></p>
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">
                      {r.workshopName}{r.projectName ? ` · ${r.projectName}` : ''}
                      {r.dueDate ? ` · سررسید وصول: ${formatJalaliTehran(r.dueDate)}` : ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {r.isOverdue ? <span className="text-amber-600 font-bold">سررسید وصول گذشته — </span> : null}
                      ثبت: {r.createdByName}
                    </p>
                    {canManage ? (
                      <div className="flex gap-1.5 mt-2.5">
                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px] gap-1" onClick={() => void settleReceivable(r)}>
                          {r.status === 'OPEN' ? <><CheckCircle2 className="size-3.5" /> وصول شد</> : <><RotateCcw className="size-3.5" /> بازگشایی</>}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px] gap-1 border-red-200 text-red-600 hover:bg-red-50" onClick={() => void deleteReceivable(r)}>
                          <Trash2 className="size-3.5" />
                          حذف
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )
        ) : null}
      </div>

      {/* شیت ثبت پرداخت */}
      {payTarget ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setPayTarget(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">ثبت پرداخت</h3>
            <p className="text-[11px] text-muted-foreground mb-4">
              خرید شمارهٔ {toFa(payTarget.number)} — ماندهٔ بدهی: <span className="numeric-input font-bold">{faMoney(payTarget.remainingAmount)}</span> تومان
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <Input
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="مبلغ (تومان)"
                  className="h-11 numeric-input bg-secondary/60"
                  inputMode="numeric"
                />
                <button type="button" onClick={() => setPayDateSheet(true)} className="rounded-xl border border-border bg-secondary/60 p-3 text-right min-h-11">
                  <span className="block text-sm font-medium">{payDate ? formatJalaliFromISO(payDate) : 'تاریخ پرداخت'}</span>
                </button>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">روش پرداخت</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PAYMENT_METHODS).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPayMethod(k)}
                      className={cn(
                        'rounded-xl border p-2.5 text-xs font-medium transition-colors',
                        payMethod === k ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card text-muted-foreground'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="شماره پیگیری / شماره چک (اختیاری)" className="h-11 bg-secondary/60" maxLength={100} />
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="توضیح (اختیاری)" className="h-11 bg-secondary/60" maxLength={500} />
              <Button className="w-full h-12" onClick={() => void submitPayment()} disabled={paySaving}>
                {paySaving ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
                ثبت پرداخت
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* شیت ویرایش سررسید */}
      {dueTarget ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setDueTarget(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">سررسید و شرایط پرداخت</h3>
            <div className="space-y-3">
              <button type="button" onClick={() => setDueDateSheet(true)} className="w-full rounded-xl border border-border bg-secondary/60 p-3 text-right min-h-11">
                <span className="block text-[11px] text-muted-foreground mb-1">تاریخ سررسید</span>
                <span className="block text-sm font-medium">{dueDate ? formatJalaliFromISO(dueDate) : 'انتخاب کنید'}</span>
              </button>
              <Input value={dueTerms} onChange={(e) => setDueTerms(e.target.value)} placeholder="شرایط پرداخت — مثلاً: ۵۰٪ هنگام خرید" className="h-11 bg-secondary/60" maxLength={300} />
              <Button className="w-full h-12" onClick={() => void submitDue()} disabled={dueSaving}>
                {dueSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                ذخیره
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* شیت ثبت طلب */}
      {recOpen ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setRecOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">ثبت طلب از کارفرما</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => setRecSheet('workshop')} className="rounded-xl border border-border bg-secondary/60 p-3 text-right min-h-14">
                  <span className="block text-[11px] text-muted-foreground mb-1">کارگاه</span>
                  <span className="block text-sm font-medium truncate">{md?.workshops.find((w) => w.id === recWorkshop)?.name ?? 'انتخاب کنید'}</span>
                </button>
                <button type="button" onClick={() => setRecSheet('project')} className="rounded-xl border border-border bg-secondary/60 p-3 text-right min-h-14">
                  <span className="block text-[11px] text-muted-foreground mb-1">پروژه (اختیاری)</span>
                  <span className="block text-sm font-medium truncate">{md?.projects.find((p) => p.id === recProjectId)?.name ?? 'انتخاب کنید'}</span>
                </button>
              </div>
              <Input value={recTitle} onChange={(e) => setRecTitle(e.target.value)} placeholder="شرح طلب — مثلاً صورت وضعیت شمارهٔ ۳" className="h-11 bg-secondary/60" maxLength={300} />
              <div className="grid grid-cols-2 gap-2.5">
                <Input value={recAmount} onChange={(e) => setRecAmount(e.target.value)} placeholder="مبلغ (تومان)" className="h-11 numeric-input bg-secondary/60" inputMode="numeric" />
                <button type="button" onClick={() => setRecDateSheet(true)} className="rounded-xl border border-border bg-secondary/60 p-3 text-right min-h-11">
                  <span className="block text-sm font-medium">{recDate ? formatJalaliFromISO(recDate) : 'سررسید وصول (اختیاری)'}</span>
                </button>
              </div>
              <Input value={recNote} onChange={(e) => setRecNote(e.target.value)} placeholder="توضیح (اختیاری)" className="h-11 bg-secondary/60" maxLength={500} />
              <Button className="w-full h-12" onClick={() => void submitReceivable()} disabled={recSaving}>
                {recSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                ثبت طلب
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <JalaliCalendarSheet open={payDateSheet} onOpenChange={setPayDateSheet} value={payDate || null} onSelect={(iso) => { setPayDate(iso); setPayDateSheet(false) }} title="تاریخ پرداخت" />
      <JalaliCalendarSheet open={dueDateSheet} onOpenChange={setDueDateSheet} value={dueDate || null} disableFuture={false} onSelect={(iso) => { setDueDate(iso); setDueDateSheet(false) }} title="تاریخ سررسید" />
      <JalaliCalendarSheet open={recDateSheet} onOpenChange={setRecDateSheet} value={recDate || null} disableFuture={false} onSelect={(iso) => { setRecDate(iso); setRecDateSheet(false) }} title="سررسید وصول" />
      <SelectionSheet open={recSheet === 'workshop'} onOpenChange={(v) => setRecSheet(v ? 'workshop' : null)} title="انتخاب کارگاه" options={workshopOptions} selected={[recWorkshop]} onConfirm={(ids) => { setRecWorkshop(ids[0] ?? ''); setRecProjectId('') }} />
      <SelectionSheet open={recSheet === 'project'} onOpenChange={(v) => setRecSheet(v ? 'project' : null)} title="انتخاب پروژه" options={projectOptions} selected={[recProjectId]} onConfirm={(ids) => setRecProjectId(ids[0] ?? '')} />
    </div>
  )
}

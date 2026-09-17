"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, PackageCheck, ShoppingBag, Trash2, Pencil, FileText, CalendarDays, Upload, HandCoins, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ClientApiError, type MasterData, type PurchaseRequestDetail } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, SelectionSheet } from '@/components/app/shared'
import { PurchaseStatusBadge } from './purchase-requests'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { formatJalaliFromISO, formatJalaliTehran, formatRelative, formatQty, toFa, todayISO } from '@/lib/fa'
import { PAYMENT_METHODS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

function faMoney(amount: string | null | undefined): string {
  if (!amount) return '—'
  return toFa(BigInt(amount).toLocaleString('en-US')).replace(/,/g, '٬')
}

type SheetKind = 'supplier' | 'date' | 'due-date' | null

export default function PurchaseDetail({ params }: { params?: Record<string, unknown> }) {
  const id = typeof params?.id === 'string' ? params.id : ''
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)

  const [request, setRequest] = useState<PurchaseRequestDetail | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // فرم ثبت خرید (مرحلهٔ کارپردازی)
  const [md, setMd] = useState<MasterData | null>(null)
  const [orderOpen, setOrderOpen] = useState(false)
  const [orderSheet, setOrderSheet] = useState<SheetKind>(null)
  const [supplierId, setSupplierId] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const invoiceInputRef = useRef<HTMLInputElement | null>(null)

  // ثبت پرداخت (مالی ساده)
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [payMethod, setPayMethod] = useState('TRANSFER')
  const [payRef, setPayRef] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payDateSheet, setPayDateSheet] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ request: PurchaseRequestDetail }>(`/api/v1/purchase-requests/${id}`)
      setRequest(res.request)
      setError(false)
    } catch {
      setError(true)
    }
  }, [id])

  useEffect(() => {
    if (id) void load()
  }, [id, load])

  useEffect(() => {
    api.get<MasterData>('/api/v1/master').then(setMd).catch(() => undefined)
  }, [])

  async function action(path: string, body?: unknown, successMsg?: string) {
    setBusy(true)
    try {
      await api.post(`/api/v1/purchase-requests/${id}/${path}`, body ?? {})
      toast.success(successMsg ?? 'انجام شد.')
      setShowReject(false)
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  function openOrderSheet() {
    setSupplierId(request?.supplierId ?? '')
    setDeliveryDate('')
    setTotalAmount('')
    setOrderNote('')
    setDueDate('')
    setPaymentTerms('')
    setOrderOpen(true)
  }

  async function submitOrder() {
    const amountRaw = toEnDigits(totalAmount).replace(/[^\d.]/g, '')
    const amount = amountRaw ? Number(amountRaw) : null
    if (amount != null && !(amount > 0)) {
      toast.error('مبلغ وارد شده معتبر نیست.')
      return
    }
    await action(
      'order',
      {
        supplierId: supplierId || null,
        expectedDeliveryAt: deliveryDate || null,
        totalAmount: amount,
        orderNote: orderNote.trim() || null,
        dueDate: dueDate || null,
        paymentTerms: paymentTerms.trim() || null,
      },
      'خریداری‌شدن ثبت شد.'
    )
    setOrderOpen(false)
  }

  function openPaySheet() {
    if (!request?.payment?.remainingAmount) return
    setPayAmount(request.payment.remainingAmount)
    setPayDate(todayISO())
    setPayMethod('TRANSFER')
    setPayRef('')
    setPayNote('')
    setPayOpen(true)
  }

  async function submitPayment() {
    const amountRaw = toEnDigits(payAmount).replace(/[^\d.]/g, '')
    const amount = amountRaw ? Number(amountRaw) : 0
    if (!(amount > 0)) {
      toast.error('مبلغ پرداخت را وارد کنید.')
      return
    }
    setBusy(true)
    try {
      await api.post('/api/v1/finance/payments', {
        purchaseId: id,
        amount,
        paidAt: payDate || todayISO(),
        method: payMethod,
        referenceNo: payRef.trim() || null,
        note: payNote.trim() || null,
      })
      toast.success('پرداخت ثبت شد.')
      setPayOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  async function uploadInvoice(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.upload(`/api/v1/purchase-requests/${id}/invoice`, form)
      toast.success('فاکتور ذخیره شد.')
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('این درخواست حذف شود؟')) return
    setBusy(true)
    try {
      await api.del(`/api/v1/purchase-requests/${id}`)
      toast.success('حذف شد.')
      back()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title="درخواست خرید" onBack={back} />
        <p className="text-center text-sm text-muted-foreground py-16">درخواست یافت نشد.</p>
      </div>
    )
  }
  if (!request) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title="درخواست خرید" onBack={back} />
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  const supplierOptions = (md?.suppliers ?? []).map((s) => ({ id: s.id, label: s.name, hint: s.phone ?? undefined }))

  return (
    <div className="max-w-lg mx-auto pb-8">
      <ScreenHeader title={`درخواست خرید شمارهٔ ${toFa(request.number)}`} subtitle={request.workshopName} onBack={back} />

      <div className="p-4 space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <PurchaseStatusBadge status={request.status} />
            <span className="text-[11px] text-muted-foreground">{formatRelative(request.createdAt)}</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">درخواست‌دهنده</span>
              <span>{request.requestedByName}</span>
            </div>
            {request.projectName ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">پروژه</span>
                <span>{request.projectName}</span>
              </div>
            ) : null}
            {request.neededBy ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">تاریخ نیاز</span>
                <span>{formatJalaliTehran(request.neededBy)}</span>
              </div>
            ) : null}
          </div>
        </div>

        {request.note ? (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-1">توضیح</p>
            <p className="text-sm leading-7 whitespace-pre-wrap">{request.note}</p>
          </div>
        ) : null}

        {/* اقلام نیاز */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold mb-2.5">اقلام موردنیاز ({toFa(request.items.length)} قلم)</p>
          <div className="space-y-2">
            {request.items.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{i.materialName}</p>
                  {i.note ? <p className="text-[11px] text-muted-foreground mt-0.5">{i.note}</p> : null}
                </div>
                <span className="text-sm font-bold shrink-0 numeric-input">
                  {toFa(formatQty(i.quantity))} {i.unit}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* اطلاعات خرید (مرحلهٔ کارپردازی) */}
        {request.orderedAt ? (
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 space-y-2">
            <p className="text-sm font-semibold text-cyan-900 flex items-center gap-1.5">
              <ShoppingBag className="size-4" />
              مشخصات خرید
            </p>
            {request.supplierName ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">تأمین‌کننده</span>
                <span>{request.supplierName}</span>
              </div>
            ) : null}
            {request.expectedDeliveryAt ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">تاریخ تحویل وعده‌شده</span>
                <span>{formatJalaliTehran(request.expectedDeliveryAt)}</span>
              </div>
            ) : null}
            {request.totalAmount ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">مبلغ کل خرید (تومان)</span>
                <span className="numeric-input font-bold">{toFa(Number(request.totalAmount).toLocaleString('fa-IR'))}</span>
              </div>
            ) : null}
            {request.dueDate ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">سررسید پرداخت</span>
                <span className={cn('numeric-input', request.payment?.isOverdue && 'text-red-600 font-bold')}>
                  {formatJalaliTehran(request.dueDate)}
                </span>
              </div>
            ) : null}
            {request.paymentTerms ? (
              <p className="text-xs text-muted-foreground leading-6">شرایط پرداخت: {request.paymentTerms}</p>
            ) : null}
            {request.orderNote ? <p className="text-xs text-muted-foreground leading-6">{request.orderNote}</p> : null}
          </div>
        ) : null}

        {/* مالی — وضعیت بدهی و پرداخت‌ها (سند سیستم یکپارچه) */}
        {request.payment && request.payment.paymentStatus !== null ? (
          <div className={cn('rounded-2xl border p-4 space-y-2.5', request.payment.isOverdue ? 'border-red-200 bg-red-50/40' : 'border-border bg-card')}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <HandCoins className="size-4 text-accent" />
                وضعیت پرداخت
              </p>
              {request.payment.isOverdue ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                  <AlertTriangle className="size-3" />
                  سررسید گذشته
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary/70 py-1.5">
                <p className="text-[10px] text-muted-foreground">مبلغ کل</p>
                <p className="text-xs font-bold numeric-input">{faMoney(request.totalAmount)}</p>
              </div>
              <div className="rounded-lg bg-secondary/70 py-1.5">
                <p className="text-[10px] text-muted-foreground">پرداخت‌شده</p>
                <p className="text-xs font-bold text-green-600 numeric-input">{faMoney(request.payment.paidAmount)}</p>
              </div>
              <div className="rounded-lg bg-red-50 py-1.5">
                <p className="text-[10px] text-muted-foreground">مانده</p>
                <p className="text-xs font-bold text-red-600 numeric-input">{faMoney(request.payment.remainingAmount)}</p>
              </div>
            </div>
            {request.payments.length > 0 ? (
              <div className="space-y-1">
                {request.payments.map((pay) => (
                  <p key={pay.id} className="text-[11px] text-muted-foreground">
                    {faMoney(pay.amount)} تومان — {PAYMENT_METHODS[pay.method as keyof typeof PAYMENT_METHODS] ?? pay.method} · {formatJalaliTehran(pay.paidAt)} · {pay.createdByName}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">هنوز پرداختی ثبت نشده است.</p>
            )}
            {request.canManageFinance && request.payment.remainingAmount && BigInt(request.payment.remainingAmount) > 0n ? (
              <Button type="button" size="sm" className="h-9 gap-1.5 w-full" onClick={openPaySheet} disabled={busy}>
                <HandCoins className="size-4" />
                ثبت پرداخت
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* فاکتور خرید */}
        {request.hasInvoice ? (
          <a
            href={request.invoiceUrl ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 active:scale-[0.99] transition-transform"
          >
            <span className="size-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <FileText className="size-5 text-accent" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{request.invoiceFileName ?? 'فاکتور خرید'}</span>
              <span className="block text-[11px] text-muted-foreground">
                تصویر فاکتور — {request.invoiceSize ? `${toFa(Math.max(1, Math.round(request.invoiceSize / 1024)))} کیلوبایت` : 'پیوست'}
              </span>
            </span>
          </a>
        ) : null}

        {/* ردپای گردش کار */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2 text-xs">
          {request.approvedAt ? (
            <p className="text-blue-700">تأیید: {request.approvedByName} — {formatRelative(request.approvedAt)}</p>
          ) : null}
          {request.orderedAt ? (
            <p className="text-cyan-700">خریداری: {request.orderedByName} — {formatRelative(request.orderedAt)}</p>
          ) : null}
          {request.receivedAt ? (
            <p className="text-green-700">دریافت انبار: {request.receivedByName} — {formatRelative(request.receivedAt)}</p>
          ) : null}
          {request.rejectedAt ? (
            <p className="text-red-700">
              رد: {request.rejectedByName} — {formatRelative(request.rejectedAt)}
              {request.rejectReason ? ` — علت: ${request.rejectReason}` : ''}
            </p>
          ) : null}
        </div>

        {/* اقدامات */}
        {request.canEdit ? (
          <Button type="button" variant="outline" className="w-full h-12" onClick={() => navigate('purchase-form', { id: request.id })} disabled={busy}>
            <Pencil className="size-4" />
            ویرایش درخواست
          </Button>
        ) : null}

        {request.canApprove ? (
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" className="h-12 col-span-2 bg-green-600 hover:bg-green-500 text-white" onClick={() => void action('approve', {}, 'درخواست تأیید شد.')} disabled={busy}>
              <CheckCircle2 className="size-4" />
              تأیید نیاز
            </Button>
            <Button type="button" variant="outline" className="h-12 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setShowReject((v) => !v)} disabled={busy}>
              <XCircle className="size-4" />
              رد
            </Button>
          </div>
        ) : null}

        {request.canOrder ? (
          <Button type="button" className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-white" onClick={openOrderSheet} disabled={busy}>
            <ShoppingBag className="size-4" />
            ثبت خرید
          </Button>
        ) : null}

        {request.canUploadInvoice ? (
          <>
            <input
              ref={invoiceInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadInvoice(f)
                e.target.value = ''
              }}
            />
            <Button type="button" variant="outline" className={cn('w-full h-12', request.hasInvoice ? '' : 'border-dashed')} onClick={() => invoiceInputRef.current?.click()} disabled={busy}>
              {request.hasInvoice ? <Pencil className="size-4" /> : <Upload className="size-4" />}
              {request.hasInvoice ? 'جایگزینی فاکتور' : 'بارگذاری تصویر فاکتور'}
            </Button>
          </>
        ) : null}

        {request.canReceive ? (
          <Button type="button" className="w-full h-12 bg-green-600 hover:bg-green-500 text-white" onClick={() => void action('receive', {}, 'دریافت در انبار ثبت شد و موجودی به‌روز شد.')} disabled={busy}>
            <PackageCheck className="size-4" />
            دریافت در انبار
          </Button>
        ) : null}

        {showReject && request.canApprove ? (
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              placeholder="علت رد (الزامی)"
              className="w-full rounded-lg border border-red-200 bg-white p-2 text-sm leading-7 outline-none"
              maxLength={500}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" onClick={() => setShowReject(false)} disabled={busy}>
                انصراف
              </Button>
              <Button className="h-11 bg-red-600 hover:bg-red-500 text-white" onClick={() => void action('reject', { reason: rejectReason.trim() }, 'درخواست رد شد.')} disabled={busy}>
                ثبت رد
              </Button>
            </div>
          </div>
        ) : null}

        {request.canDelete ? (
          <Button type="button" variant="outline" className="w-full h-12 border-red-200 text-red-600 hover:bg-red-50" onClick={() => void remove()} disabled={busy}>
            <Trash2 className="size-4" />
            حذف درخواست
          </Button>
        ) : null}
      </div>

      {/* شیت ثبت خرید */}
      {orderOpen ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setOrderOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-4">ثبت خرید — مرحلهٔ کارپردازی</h3>
            <div className="space-y-3">
              <button type="button" onClick={() => setOrderSheet('supplier')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-14">
                <span className="block text-[11px] text-muted-foreground mb-1">تأمین‌کننده</span>
                <span className="block text-sm font-medium truncate">{supplierOptions.find((s) => s.id === supplierId)?.label ?? 'انتخاب کنید'}</span>
              </button>
              <button type="button" onClick={() => setOrderSheet('date')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-14">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
                  <CalendarDays className="size-3" />
                  تاریخ تحویل وعده‌شده (اختیاری)
                </span>
                <span className="block text-sm font-medium">{deliveryDate ? formatJalaliFromISO(deliveryDate) : 'انتخاب کنید'}</span>
              </button>
              <Input
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="مبلغ کل خرید به تومان (اختیاری)"
                className="h-12 numeric-input bg-secondary/60"
                inputMode="numeric"
                maxLength={15}
              />
              <button type="button" onClick={() => setOrderSheet('due-date')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-14">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
                  <CalendarDays className="size-3" />
                  سررسید پرداخت (اختیاری)
                </span>
                <span className="block text-sm font-medium">{dueDate ? formatJalaliFromISO(dueDate) : 'انتخاب کنید'}</span>
              </button>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="شرایط پرداخت — مثلاً: ۵۰٪ هنگام خرید، مابقی بعد از تحویل"
                className="h-11 bg-secondary/60"
                maxLength={300}
              />
              <Input
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="توضیح خرید (اختیاری)"
                className="h-11 bg-secondary/60"
                maxLength={300}
              />
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <Button variant="outline" className="h-12" onClick={() => setOrderOpen(false)} disabled={busy}>
                  انصراف
                </Button>
                <Button className="h-12 bg-cyan-600 hover:bg-cyan-500 text-white" onClick={() => void submitOrder()} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />}
                  ثبت خرید
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-5 px-1">
                پس از ثبت خرید می‌توانید تصویر فاکتور را بارگذاری کنید؛ با «دریافت در انبار»، اقلام به موجودی انبار اضافه می‌شود.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <SelectionSheet
        open={orderSheet === 'supplier'}
        onOpenChange={(v) => setOrderSheet(v ? 'supplier' : null)}
        title="انتخاب تأمین‌کننده"
        options={supplierOptions}
        selected={supplierId ? [supplierId] : []}
        onConfirm={(ids) => setSupplierId(ids[0] ?? '')}
      />
      <JalaliCalendarSheet
        open={orderSheet === 'date'}
        onOpenChange={(v) => setOrderSheet(v ? 'date' : null)}
        title="تاریخ تحویل وعده‌شده"
        value={deliveryDate || todayISO()}
        onSelect={(iso) => setDeliveryDate(iso)}
      />
      <JalaliCalendarSheet
        open={orderSheet === 'due-date'}
        onOpenChange={(v) => setOrderSheet(v ? 'due-date' : null)}
        title="سررسید پرداخت"
        disableFuture={false}
        value={dueDate || todayISO()}
        onSelect={(iso) => setDueDate(iso)}
      />
      <JalaliCalendarSheet
        open={payDateSheet}
        onOpenChange={setPayDateSheet}
        title="تاریخ پرداخت"
        value={payDate || todayISO()}
        onSelect={(iso) => setPayDate(iso)}
      />

      {/* شیت ثبت پرداخت */}
      {payOpen ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setPayOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">ثبت پرداخت خرید</h3>
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
              <Button className="w-full h-12" onClick={() => void submitPayment()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
                ثبت پرداخت
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Send, CheckCircle2, XCircle, FileSignature, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api, ClientApiError, type StatementDetail as StatementDetailData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader } from '@/components/app/shared'
import { StatementStatusBadge } from './statements'
import { SignaturePad } from '@/components/app/signature-pad'
import { GM_SIGN_THRESHOLD_TOMAN } from '@/lib/permissions'
import { formatJalaliDateTime, toFa, formatQty } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

export default function StatementDetail({ params }: { params?: Record<string, unknown> }) {
  const id = typeof params?.id === 'string' ? params.id : ''
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)

  const [statement, setStatement] = useState<StatementDetailData | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [actionNote, setActionNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ statement: StatementDetailData }>(`/api/v1/statements/${id}`)
      setStatement(res.statement)
      setError(false)
    } catch {
      setError(true)
    }
  }, [id])

  useEffect(() => {
    if (id) void load()
  }, [id, load])

  async function submit() {
    setBusy(true)
    try {
      await api.post(`/api/v1/statements/${id}/submit`, {})
      toast.success('صورت وضعیت ارسال شد.')
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    setBusy(true)
    try {
      const res = await api.post<{ status: string }>(`/api/v1/statements/${id}/approve`, { note: actionNote.trim() || null })
      toast.success(res.status === 'PENDING_GM_SIGN' ? 'تأیید شد — منتظر امضای مدیر کل' : 'صورت وضعیت تأیید شد.')
      setActionNote('')
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    if (rejectReason.trim().length < 3) {
      toast.error('علت رد را بنویسید.')
      return
    }
    setBusy(true)
    try {
      await api.post(`/api/v1/statements/${id}/reject`, { reason: rejectReason.trim() })
      toast.success('صورت وضعیت رد شد.')
      setShowReject(false)
      setRejectReason('')
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  async function sign(signatureData: string) {
    setBusy(true)
    try {
      await api.post(`/api/v1/statements/${id}/sign`, { signatureData })
      toast.success('امضای مدیر کل ثبت شد — صورت وضعیت نهایی شد.')
      setSignOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('این پیش‌نویس حذف شود؟')) return
    setBusy(true)
    try {
      await api.del(`/api/v1/statements/${id}`)
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
        <ScreenHeader title="صورت وضعیت" onBack={back} />
        <p className="text-center text-sm text-muted-foreground py-16">صورت وضعیت یافت نشد.</p>
      </div>
    )
  }
  if (!statement) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title="صورت وضعیت" onBack={back} />
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <ScreenHeader title={`صورت وضعیت شمارهٔ ${toFa(statement.number)}`} subtitle={statement.title} onBack={back} />

      <div className="p-4 space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <StatementStatusBadge status={statement.status} />
            {statement.needsGmSign ? (
              <span className="text-[10px] rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5">
                نیازمند امضای مدیر کل
              </span>
            ) : null}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">مبلغ</span>
              <span className="font-bold">{statement.amountFormatted} تومان</span>
            </div>
            {statement.periodText ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">دوره</span>
                <span>{statement.periodText}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">کارگاه</span>
              <span>{statement.workshopName}</span>
            </div>
            {statement.projectName ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">پروژه</span>
                <span>{statement.projectName}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">ثبت‌کننده</span>
              <span>{statement.createdByName}</span>
            </div>
          </div>
        </div>

        {statement.description ? (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold mb-2">شرح</p>
            <p className="text-sm leading-8 whitespace-pre-wrap">{statement.description}</p>
          </div>
        ) : null}

        {/* ردپای گردش کار */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5 text-xs">
          {statement.submittedAt ? (
            <p className="text-muted-foreground">ارسال: {formatJalaliDateTime(statement.submittedAt)}</p>
          ) : null}
          {statement.approvedByName && statement.approvedAt ? (
            <p className="text-green-700">
              تأیید مدیر: {statement.approvedByName} — {formatJalaliDateTime(statement.approvedAt)}
              {statement.approvalNote ? ` — ${statement.approvalNote}` : ''}
            </p>
          ) : null}
          {statement.signedAt ? (
            <p className="text-emerald-700">
              امضای مدیر کل: {statement.signerName ?? statement.signedByName} — {formatJalaliDateTime(statement.signedAt)}
            </p>
          ) : null}
          {statement.rejectedAt ? (
            <p className="text-red-700">
              رد: {statement.rejectedByName} — {formatJalaliDateTime(statement.rejectedAt)}
              {statement.rejectReason ? ` — علت: ${statement.rejectReason}` : ''}
            </p>
          ) : null}
        </div>

        {/* نمایش امضا */}
        {statement.signatureUrl ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1.5">
              <FileSignature className="size-4" />
              امضای مدیر کل
            </p>
            { }
            <img
              src={statement.signatureUrl}
              alt={`امضای ${statement.signerName ?? 'مدیر کل'}`}
              className="h-28 rounded-xl border border-emerald-200 bg-white"
              dir="ltr"
            />
            <p className="text-[11px] text-emerald-700 mt-2">
              {statement.signerName ?? ''} — {statement.signedAt ? formatJalaliDateTime(statement.signedAt) : ''}
            </p>
          </div>
        ) : null}

        {statement.needsGmSign && statement.status !== 'SIGNED' && statement.status !== 'REJECTED' ? (
          <p className="text-[11px] text-muted-foreground text-center leading-6 px-4">
            آستانهٔ امضای مدیر کل: {toFa(formatQty(GM_SIGN_THRESHOLD_TOMAN))} تومان — این صورت وضعیت بالای آستانه است.
          </p>
        ) : null}

        {/* اقدامات */}
        {statement.canEdit ? (
          <Button type="button" variant="outline" className="w-full h-12" onClick={() => navigate('statement-form', { id: statement.id })} disabled={busy}>
            <Pencil className="size-4" />
            ویرایش پیش‌نویس
          </Button>
        ) : null}

        {statement.canSubmit ? (
          <Button type="button" className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            ارسال برای بررسی
          </Button>
        ) : null}

        {statement.canApprove ? (
          <div className="space-y-2">
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={2}
              placeholder="یادداشت تأیید (اختیاری)"
              className="w-full rounded-lg border border-border bg-secondary p-2 text-sm leading-7 outline-none"
              maxLength={500}
            />
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" className="h-12 col-span-2 border-green-300 text-green-700 hover:bg-green-50" onClick={() => void approve()} disabled={busy}>
                <CheckCircle2 className="size-4" />
                تأیید
              </Button>
              <Button type="button" variant="outline" className="h-12 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setShowReject((v) => !v)} disabled={busy}>
                <XCircle className="size-4" />
                رد
              </Button>
            </div>
          </div>
        ) : null}

        {statement.canSign && statement.status === 'PENDING_GM_SIGN' ? (
          <>
            <Button type="button" className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white text-base" onClick={() => setSignOpen(true)} disabled={busy}>
              <FileSignature className="size-5" />
              امضای مدیر کل
            </Button>
            <Button type="button" variant="outline" className="w-full h-11 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setShowReject((v) => !v)} disabled={busy}>
              <XCircle className="size-4" />
              عدم تأیید (رد)
            </Button>
          </>
        ) : null}

        {showReject && (statement.canApprove || (statement.canSign && statement.status === 'PENDING_GM_SIGN')) ? (
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
              <Button className="h-11 bg-red-600 hover:bg-red-500 text-white" onClick={() => void reject()} disabled={busy}>
                ثبت رد
              </Button>
            </div>
          </div>
        ) : null}

        {statement.canDelete ? (
          <Button type="button" variant="outline" className="w-full h-12 border-red-200 text-red-600 hover:bg-red-50" onClick={() => void remove()} disabled={busy}>
            <Trash2 className="size-4" />
            حذف پیش‌نویس
          </Button>
        ) : null}
      </div>

      {signOpen ? (
        <SignaturePad open onDone={(d) => void sign(d)} onCancel={() => setSignOpen(false)} busy={busy} />
      ) : null}
    </div>
  )
}
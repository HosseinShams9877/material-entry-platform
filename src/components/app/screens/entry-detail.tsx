"use client"

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, XCircle, PenLine, SendHorizonal, Wrench, Paperclip,
  History, User, MapPin, FileText, Clock, ArrowLeftRight, GitBranch, Warehouse, Truck,
  PackageCheck, Undo2, ClipboardCheck, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type EntryDetailData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, StatusBadge, ListSkeleton, ErrorState } from '@/components/app/shared'
import { AttachmentUploader, type UploadedAttachment } from '@/components/app/attachment-uploader'
import { ENTRY_TYPES, WORKER_KINDS, ENTRY_STAGE_LABELS, ENTRY_STAGE_STYLES, STATUS_STYLES } from '@/lib/permissions'
import { formatJalaliDateTime, formatQty, toFa, formatTimeRemaining, formatJalaliFromISO } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'
import { Drawer } from 'vaul'

export default function EntryDetail({ params }: { params?: Record<string, unknown> }) {
  const id = params?.id as string | undefined
  const justCreated = params?.justCreated as boolean | undefined
  const [data, setData] = useState<EntryDetailData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<null | 'review' | 'reason'>(null)
  const [reviewAction, setReviewAction] = useState<'REJECT' | 'REQUEST_CORRECTION'>('REJECT')
  const [reason, setReason] = useState('')
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [showStages, setShowStages] = useState(true)
  const navigate = useApp((s) => s.navigate)
  const back = useApp((s) => s.back)

  const load = useCallback(async () => {
    if (!id) return
    setError('')
    try {
      const res = await api.get<EntryDetailData>(`/api/v1/material-entries/${id}`)
      setData(res)
      setAttachments(
        res.entry.attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          fileName: a.fileName,
          mimeType: a.mimeType,
          size: a.size,
          url: `/api/v1/attachments/${a.id}/file`,
        }))
      )
    } catch (err) {
      if (err instanceof ClientApiError) setError(err.message)
      else setError(ERROR_MSG)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function action(fn: () => Promise<unknown>, successMsg: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(successMsg)
      await load()
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) {
    return (
      <div className="max-w-lg mx-auto min-h-dvh">
        <ScreenHeader title="جزئیات ثبت" onBack={back} />
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-lg mx-auto min-h-dvh">
        <ScreenHeader title="جزئیات ثبت" onBack={back} />
        <ListSkeleton rows={3} />
      </div>
    )
  }

  const e = data.entry
  const canSubmit = e.canResubmit

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title={`ثبت شماره ${toFa(e.entryNumber)}`}
        subtitle={ENTRY_TYPES[e.type as keyof typeof ENTRY_TYPES] ?? e.type}
        onBack={back}
        right={<StatusBadge status={e.status} size="sm" />}
      />

      <div className="p-4 space-y-3.5 pb-10">
        {/* اعلان ساخت موفق */}
        {justCreated ? (
          <div className="rounded-xl bg-green-50 border border-green-200 p-3.5 flex items-start gap-2.5">
            <CheckCircle2 className="size-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">پیش‌نویس آماده است</p>
              <p className="text-xs text-green-700 mt-0.5 leading-5">
                اطلاعات زیر را بررسی کنید، مدارک را پیوست کنید و سپس برای مدیر ارسال کنید.
              </p>
            </div>
          </div>
        ) : null}

        {/* راهنمای وضعیت / مهلت ویرایش */}
        {e.hint && e.status !== 'DRAFT' ? (
          <div
            className={`rounded-xl border p-3.5 text-xs leading-6 ${
              e.status === 'REJECTED'
                ? 'bg-red-50 border-red-200 text-red-700'
                : e.status === 'CORRECTION_REQUESTED'
                  ? 'bg-orange-50 border-orange-200 text-orange-700'
                  : e.status === 'LOCKED'
                    ? 'bg-zinc-100 border-zinc-300 text-zinc-700'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}
          >
            {e.hint}
            {e.submittedAt && e.status !== 'LOCKED' ? (
              <span className="block mt-1 font-medium">
                ⏳ {formatTimeRemaining(e.editDeadline)} از مهلت ویرایش باقی مانده است
              </span>
            ) : null}
          </div>
        ) : null}

        {/* رد شد / درخواست اصلاح — دلیل مدیر */}
        {e.decisionNote && ['REJECTED', 'CORRECTION_REQUESTED'].includes(e.status) ? (
          <div className="rounded-xl bg-card border border-border p-3.5">
            <p className="text-xs font-semibold mb-1">دلیل مدیر:</p>
            <p className="text-sm leading-6">{e.decisionNote}</p>
          </div>
        ) : null}

        {/* ───────── کارت تأیید ثبت (Preview) ───────── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="bg-secondary/70 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold">تأیید ثبت ورود مصالح</span>
            {e.currentVersion > 1 ? (
              <span className="text-[10px] bg-zinc-800 text-white rounded-md px-2 py-0.5">نسخه {toFa(e.currentVersion)}</span>
            ) : null}
          </div>

          <div className="p-4 space-y-3 text-sm">
            <Row label="پروژه">
              <span className="flex flex-wrap gap-1 justify-end">
                {e.projects.map((p) => (
                  <span key={p.project.id} className="bg-accent/10 text-accent rounded-md px-2 py-0.5 text-xs font-medium">
                    {p.project.name}
                  </span>
                ))}
              </span>
            </Row>
            <Row label="نوع ورود">{ENTRY_TYPES[e.type as keyof typeof ENTRY_TYPES] ?? e.type}</Row>
            {e.deliveryAt ? (
              <Row label="تاریخ ورود مصالح">
                <span className="font-medium">{formatJalaliFromISO(String(e.deliveryAt))}</span>
              </Row>
            ) : null}
            <Row label="مبدأ">
              {e.sourceType === 'SUPPLIER'
                ? e.sourceSupplier?.name
                : e.sourceType === 'WORKSHOP'
                  ? e.sourceWorkshop?.name
                  : e.sourceDescription}
              {e.sourceType === 'WORKSHOP' ? <span className="text-[10px] text-muted-foreground block">(فقط نام کارگاه قابل مشاهده است)</span> : null}
            </Row>

            <div className="border-t border-dashed border-border pt-3 space-y-2">
              {e.items.map((it, i) => (
                <div key={it.id} className="flex items-center justify-between">
                  <span className="font-medium">
                    {it.materialName}
                    {it.brand ? <span className="text-xs text-muted-foreground"> ({it.brand})</span> : null}
                  </span>
                  <span className="font-bold text-accent">
                    {formatQty(it.quantity)} {it.unit}
                  </span>
                  {i === 0 && e.items.length > 1 ? null : null}
                </div>
              ))}
            </div>

            {e.workers.length > 0 ? (
              <Row label="افراد">
                <span className="flex flex-wrap gap-1 justify-end">
                  {e.workers.map((w) => (
                    <span key={w.id} className="bg-secondary rounded-md px-2 py-0.5 text-xs">
                      {w.workerName}
                      {w.workerKind !== 'LABORER' ? ` (${WORKER_KINDS[w.workerKind as keyof typeof WORKER_KINDS] ?? w.workerKind})` : ''}
                    </span>
                  ))}
                </span>
              </Row>
            ) : null}

            {e.notes ? <Row label="یادداشت"><span className="text-xs leading-6">{e.notes}</span></Row> : null}

            <div className="border-t border-dashed border-border pt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="size-3.5" />
                سرپرست: {e.supervisor.fullName}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {e.workshop.name}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                ثبت: {formatJalaliDateTime(e.createdAt)}
              </span>
              {e.submittedAt ? (
                <span className="flex items-center gap-1">
                  <SendHorizonal className="size-3.5" />
                  ارسال: {formatJalaliDateTime(e.submittedAt)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* ───────── مدارک ───────── */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">فاکتور و مدارک</h3>
          </div>
          {e.canEdit || e.status === 'DRAFT' || e.status === 'CORRECTION_REQUESTED' ? (
            <AttachmentUploader entryId={e.id} attachments={attachments} onChange={setAttachments} />
          ) : attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5"
                >
                  <FileText className="size-5 text-accent" />
                  <span className="text-xs font-medium flex-1 truncate">{a.fileName}</span>
                  <span className="text-[10px] text-muted-foreground">مشاهده</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">مدرکی پیوست نشده است.</p>
          )}
        </div>

        {/* ───────── اکشن‌ها ───────── */}

        {/* سرپرست: ارسال برای مدیر */}
        {canSubmit ? (
          <Button
            disabled={busy}
            onClick={() =>
              void action(
                () => api.post(`/api/v1/material-entries/${e.id}/${e.status === 'DRAFT' ? 'submit' : 'resubmit'}`),
                e.status === 'DRAFT' ? 'ثبت برای مدیر ارسال شد.' : 'برای مدیر ارسال شد.'
              )
            }
            className="w-full h-13 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold h-12"
          >
            <SendHorizonal className="size-5" />
            ثبت و ارسال برای مدیر
          </Button>
        ) : null}

        {/* سرپرست: ویرایش (در مهلت) */}
        {e.canEdit ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => navigate('manual-entry', { editId: e.id })}
            className="w-full h-12 rounded-xl"
          >
            <PenLine className="size-4" />
            ویرایش ثبت
          </Button>
        ) : null}

        {/* سرپرست: درخواست اصلاح (بعد از قفل) */}
        {e.canRequestCorrection ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setReason('')
              setSheet('reason')
            }}
            className="w-full h-12 rounded-xl border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            <Wrench className="size-4" />
            ارسال درخواست اصلاح به مدیر
          </Button>
        ) : null}

        {/* مدیر: بررسی */}
        {e.canReview ? (
          <div className="grid grid-cols-3 gap-2">
            <Button
              disabled={busy}
              onClick={() => void action(() => api.post(`/api/v1/material-entries/${e.id}/review`, { action: 'APPROVE' }), 'ثبت تأیید شد.')}
              className="h-12 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold"
            >
              <CheckCircle2 className="size-4" />
              تأیید
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setReviewAction('REQUEST_CORRECTION')
                setReason('')
                setSheet('review')
              }}
              className="h-12 rounded-xl border-orange-300 text-orange-700"
            >
              <Wrench className="size-4" />
              اصلاح
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setReviewAction('REJECT')
                setReason('')
                setSheet('review')
              }}
              className="h-12 rounded-xl border-red-300 text-red-600"
            >
              <XCircle className="size-4" />
              رد
            </Button>
          </div>
        ) : null}

        {/* ───────── اقدامات زنجیرهٔ حرفه‌ای Workflow ───────── */}

        {/* ناظر: بررسی فنی */}
        {e.canTechReview ? (
          <div className="grid grid-cols-2 gap-2">
            {e.status !== 'TECH_REVIEW' ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void action(() => api.post(`/api/v1/material-entries/${e.id}/tech-review`, { action: 'START' }), 'بررسی فنی آغاز شد.')}
                className="h-12 rounded-xl border-violet-300 text-violet-700"
              >
                <ClipboardCheck className="size-4" />
                شروع بررسی فنی
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={() => void action(() => api.post(`/api/v1/material-entries/${e.id}/tech-review`, { action: 'COMPLETE', note: null }), 'بررسی فنی کامل شد.')}
                className="h-12 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold"
              >
                <ClipboardCheck className="size-4" />
                ثبت نتیجهٔ بررسی فنی
              </Button>
            )}
          </div>
        ) : null}

        {/* انباردار: تأیید انبار / تحویل */}
        {e.canWarehouseConfirm ? (
          <Button
            disabled={busy}
            onClick={() => void action(() => api.post(`/api/v1/material-entries/${e.id}/warehouse-confirm`, {}), 'تأیید انبار ثبت شد.')}
            className="w-full h-12 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
          >
            <Warehouse className="size-4" />
            تأیید انبار
          </Button>
        ) : null}
        {e.canDeliver ? (
          <Button
            disabled={busy}
            onClick={() => void action(() => api.post(`/api/v1/material-entries/${e.id}/deliver`, {}), 'مصالح تحویل شد.')}
            className="w-full h-12 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold"
          >
            <Truck className="size-4" />
            تحویل مصالح
          </Button>
        ) : null}

        {/* مدیر: بستن ثبت */}
        {e.canClose ? (
          <Button
            disabled={busy}
            onClick={() => void action(() => api.post(`/api/v1/material-entries/${e.id}/close`, {}), 'ثبت بسته شد.')}
            className="w-full h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold"
          >
            <PackageCheck className="size-4" />
            بستن ثبت
          </Button>
        ) : null}

        {/* مدیر/ادمین: برگشت مرحله */}
        {e.canRollback ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void action(() => api.post(`/api/v1/material-entries/${e.id}/rollback`, { reason: null }), 'ثبت به مرحلهٔ قبل برگشت.')}
            className="w-full h-11 rounded-xl border-zinc-300 text-zinc-700"
          >
            <Undo2 className="size-4" />
            برگشت به مرحلهٔ قبل
          </Button>
        ) : null}

        {/* ───────── Timeline مراحل ───────── */}
        {e.stageLogs.length > 0 ? (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowStages((s) => !s)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <GitBranch className="size-4 text-accent" />
                مسیر گردش کار
              </span>
              {showStages ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
            </button>
            {showStages ? (
              <ol className="px-4 pb-4 space-y-0 relative" dir="rtl">
                {e.stageLogs.map((log, idx) => {
                  const stageStyle = ENTRY_STAGE_STYLES[log.stage] ?? STATUS_STYLES[log.stage]
                  const dot = stageStyle?.dot ?? 'bg-zinc-400'
                  const isRollback = log.action === 'ROLLBACK'
                  return (
                    <li key={log.id} className="flex gap-3 relative pb-3 last:pb-0">
                      {idx < e.stageLogs.length - 1 ? <span className="absolute right-[7px] top-4 bottom-0 w-px bg-border" /> : null}
                      <span className={`mt-1 size-3.5 rounded-full shrink-0 border-2 border-card ${isRollback ? 'bg-orange-500' : dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-semibold">
                            {isRollback ? '↩ برگشت به ' : ''}
                            {ENTRY_STAGE_LABELS[log.stage] ?? log.stage}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{formatJalaliDateTime(log.createdAt)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {log.actor.fullName}
                          {log.note ? ` — ${log.note}` : ''}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : null}
          </div>
        ) : null}

        {/* ───────── نسخه‌ها و تاریخچه ───────── */}
        {e.versions.length > 0 || e.approvals.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowVersions((s) => !s)}
            className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <History className="size-4 text-muted-foreground" />
              نسخه‌ها و تاریخچه تغییرات
            </span>
            <span className="text-xs text-muted-foreground">
              {toFa(e.versions.length)} نسخه · {toFa(e.approvals.length)} اقدام
            </span>
          </button>
        ) : null}

        {showVersions ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            {e.versions.map((v) => {
              let snapshot: Record<string, unknown> = {}
              try {
                snapshot = JSON.parse(v.snapshotJson)
              } catch { /* ignore */ }
              const items = (snapshot.items as Array<{ materialName?: string; quantity?: number; unit?: string }>) ?? []
              return (
                <div key={v.id} className={`rounded-lg p-3 ${v.version === e.currentVersion ? 'bg-accent/5 border border-accent/30' : 'bg-secondary/50'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold">
                      نسخه {toFa(v.version)}
                      {v.version === e.currentVersion ? ' (فعلی)' : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatJalaliDateTime(v.createdAt)}</span>
                  </div>
                  {items.map((it, i) => (
                    <p key={i} className="text-xs leading-6">
                      {it.materialName} — {formatQty(it.quantity ?? 0)} {it.unit}
                    </p>
                  ))}
                  {v.changeReason ? <p className="text-[10px] text-muted-foreground mt-1">علت: {v.changeReason}</p> : null}
                  <p className="text-[10px] text-muted-foreground">تغییردهنده: {v.changedBy.fullName}</p>
                </div>
              )
            })}
            {e.approvals.map((a) => (
              <div key={a.id} className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs font-medium">
                  {a.action === 'APPROVE' ? '✅ تأیید' : a.action === 'REJECT' ? '❌ رد' : a.action === 'REQUEST_CORRECTION' ? '🔧 درخواست اصلاح' : '✔ تأیید اصلاح'} — {a.decidedBy.fullName}
                </p>
                {a.reason ? <p className="text-[11px] text-muted-foreground mt-0.5">{a.reason}</p> : null}
                <p className="text-[10px] text-muted-foreground">{formatJalaliDateTime(a.decidedAt)}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* درخواست‌های اصلاح ثبت‌شده */}
        {e.corrections.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
            <p className="text-sm font-semibold flex items-center gap-2">
              <ArrowLeftRight className="size-4 text-muted-foreground" />
              درخواست‌های اصلاح
            </p>
            {e.corrections.map((c) => (
              <div key={c.id} className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs leading-6">{c.reason}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {c.requestedBy.fullName} · {formatJalaliDateTime(c.createdAt)} ·{' '}
                  {c.status === 'PENDING' ? 'در انتظار بررسی' : c.status === 'APPROVED' ? 'تأیید شده' : 'رد شده'}
                </p>
                {c.responseNote ? <p className="text-[11px] mt-1">پاسخ مدیر: {c.responseNote}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Sheet بررسی مدیر */}
      <Drawer.Root open={sheet === 'review'} onOpenChange={(o) => !o && setSheet(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <div className="p-5">
              <Drawer.Title className="font-semibold mb-1">
                {reviewAction === 'REJECT' ? 'رد ثبت' : 'درخواست اصلاح'}
              </Drawer.Title>
              <p className="text-xs text-muted-foreground mb-3">
                {reviewAction === 'REJECT' ? 'دلیل رد را برای سرپرست بنویسید:' : 'چه چیزی باید اصلاح شود؟'}
              </p>
              <Textarea value={reason} onChange={(ev) => setReason(ev.target.value)} rows={3} placeholder="دلیل…" />
              <Button
                className="w-full mt-3 h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  void action(
                    () => api.post(`/api/v1/material-entries/${e.id}/review`, { action: reviewAction, reason }),
                    reviewAction === 'REJECT' ? 'ثبت رد شد.' : 'درخواست اصلاح ارسال شد.'
                  ).then(() => setSheet(null))
                }
              >
                ثبت
              </Button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Sheet درخواست اصلاح سرپرست */}
      <Drawer.Root open={sheet === 'reason'} onOpenChange={(o) => !o && setSheet(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <div className="p-5">
              <Drawer.Title className="font-semibold mb-1">درخواست اصلاح</Drawer.Title>
              <p className="text-xs text-muted-foreground mb-3">
                علت اصلاح را بنویسید. رکورد فعلی دست‌نخورده می‌ماند و مدیر بررسی می‌کند.
              </p>
              <Textarea value={reason} onChange={(ev) => setReason(ev.target.value)} rows={3} placeholder="مثلاً: مقدار سیمان اشتباه ثبت شده است…" />
              <Button
                className="w-full mt-3 h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                disabled={busy || reason.trim().length < 5}
                onClick={() =>
                  void action(
                    () => api.post(`/api/v1/material-entries/${e.id}/correction-request`, { reason }),
                    'درخواست اصلاح برای مدیر ارسال شد.'
                  ).then(() => setSheet(null))
                }
              >
                ارسال درخواست
              </Button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground text-xs mt-1 shrink-0">{label}</span>
      <span className="text-left">{children}</span>
    </div>
  )
}

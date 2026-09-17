"use client"

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Send, CheckCheck, CalendarDays, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api, ClientApiError, type DailyReportDetail } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, ReportStatusBadge } from '@/components/app/shared'
import { formatJalaliDateTime, formatJalaliTehran, formatRelative } from '@/lib/fa'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

export default function DailyReportDetailScreen({ params }: { params?: Record<string, unknown> }) {
  const id = typeof params?.id === 'string' ? params.id : null
  const [report, setReport] = useState<DailyReportDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [showReview, setShowReview] = useState(false)
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await api.get<{ report: DailyReportDetail }>(`/api/v1/daily-reports/${id}`)
      setReport(res.report)
      setError('')
    } catch {
      setError(ERROR_MSG)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function submit() {
    if (!id) return
    setBusy(true)
    try {
      await api.post(`/api/v1/daily-reports/${id}/submit`, {})
      toast.success('گزارش ارسال شد. مدیران اعلان می‌گیرند.')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در ارسال گزارش.')
    } finally {
      setBusy(false)
    }
  }

  async function review() {
    if (!id) return
    setBusy(true)
    try {
      await api.post(`/api/v1/daily-reports/${id}/review`, reviewNote.trim() ? { note: reviewNote.trim() } : {})
      toast.success('گزارش بررسی شد.')
      setShowReview(false)
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در بررسی گزارش.')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title="جزئیات گزارش" onBack={back} />
        <p className="text-center text-sm text-muted-foreground py-16">{error}</p>
      </div>
    )
  }
  if (!report) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title="جزئیات گزارش" onBack={back} />
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-10">
      <ScreenHeader
        title="جزئیات گزارش"
        subtitle={report.workshopName}
        onBack={back}
        right={
          report.canEdit ? (
            <Button size="icon" variant="ghost" className="size-10" onClick={() => navigate('daily-report-form', { id: report.id })} aria-label="ویرایش">
              <Pencil className="size-4" />
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <ReportStatusBadge status={report.status} />
            <span className="text-[11px] text-muted-foreground">{formatRelative(report.createdAt)}</span>
          </div>
          <h2 className="text-base font-bold leading-7">{report.title}</h2>
          <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="size-3" />
              گزارش‌دهنده: {report.reporterName}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" />
              تاریخ: {formatJalaliTehran(report.reportDate)}
            </span>
            <span>پروژه: {report.projectName}</span>
            <span>کارگاه: {report.workshopName}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold mb-2">متن گزارش</p>
          <p className="text-sm leading-8 whitespace-pre-wrap">{report.content}</p>
        </div>

        {report.reviewedAt ? (
          <div className="rounded-xl bg-green-50 border border-green-200 text-green-700 px-3 py-2 text-sm">
            بررسی‌شده: {formatJalaliDateTime(report.reviewedAt)}
            {report.reviewedByName ? ` — ${report.reviewedByName}` : ''}
            {report.reviewNote ? ` — ${report.reviewNote}` : ''}
          </div>
        ) : null}

        {/* اقدامات */}
        {report.canSubmit ? (
          <Button type="button" className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            ارسال نهایی گزارش به مدیران
          </Button>
        ) : null}

        {report.canReview ? (
          !showReview ? (
            <Button type="button" variant="outline" className="w-full h-12 border-green-300 text-green-700 hover:bg-green-50" onClick={() => setShowReview(true)}>
              <CheckCheck className="size-4" />
              بررسی و ثبت مشاهدهٔ گزارش
            </Button>
          ) : (
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={2}
                placeholder="یادداشت بررسی (اختیاری)"
                className="w-full rounded-lg border border-border bg-secondary p-2 text-sm leading-7 outline-none"
                maxLength={500}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" onClick={() => setShowReview(false)}>انصراف</Button>
                <Button className="h-11 bg-green-600 hover:bg-green-500 text-white" onClick={() => void review()} disabled={busy}>
                  ثبت بررسی
                </Button>
              </div>
            </div>
          )
        ) : null}

        {report.submittedAt ? (
          <p className={cn('text-[11px] text-muted-foreground text-center')}>
            ارسال‌شده: {formatJalaliDateTime(report.submittedAt)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

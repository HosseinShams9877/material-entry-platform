"use client"

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Send, Eye, CalendarDays, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type AudioUploadResult, type DailyReportDetail, type MasterDataWithSupervisors } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, SelectionSheet } from '@/components/app/shared'
import { AudioRecorder, AudioHint } from '@/components/app/daily-shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { todayISO, formatJalaliFromISO } from '@/lib/fa'

type SheetKind = 'project' | 'workshop' | 'date' | 'preview' | null

export default function DailyReportForm({ params }: { params?: Record<string, unknown> }) {
  const editId = typeof params?.id === 'string' ? params.id : null
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)

  const [md, setMd] = useState<MasterDataWithSupervisors | null>(null)
  const [loaded, setLoaded] = useState(editId === null)
  const [projectId, setProjectId] = useState('')
  const [workshopId, setWorkshopId] = useState('')
  const [reportDate, setReportDate] = useState(todayISO())
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [audioId, setAudioId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [saving, setSaving] = useState(false)
  const [sheet, setSheet] = useState<SheetKind>(null)

  useEffect(() => {
    api
      .get<MasterDataWithSupervisors>('/api/v1/master')
      .then((data) => {
        setMd(data)
        if (!editId) {
          const firstWs = data.workshops[0]?.id ?? ''
          setWorkshopId(firstWs)
          const firstPrj = data.projects.find((p) => p.workshopId === firstWs) ?? data.projects[0]
          if (firstPrj) setProjectId(firstPrj.id)
        }
      })
      .catch(() => toast.error('بارگذاری داده‌های پایه ناموفق بود.'))
  }, [editId])

  useEffect(() => {
    if (!editId) return
    api
      .get<{ report: DailyReportDetail }>(`/api/v1/daily-reports/${editId}`)
      .then(({ report }) => {
        setTitle(report.title)
        setContent(report.content)
        setProjectId(report.projectId)
        setWorkshopId(report.workshopId)
        setReportDate(new Date(report.reportDate).toISOString().slice(0, 10))
        setTranscript(report.transcript ?? '')
        if (report.audio) setAudioId(report.audio.id)
        setLoaded(true)
      })
      .catch(() => {
        toast.error('گزارش یافت نشد.')
        back()
      })
  }, [editId, back])

  const projectOptions = useMemo(
    () => (md?.projects ?? []).filter((p) => !workshopId || p.workshopId === null || p.workshopId === workshopId).map((p) => ({ id: p.id, label: p.name, hint: p.code })),
    [md, workshopId]
  )
  const workshopOptions = useMemo(() => (md?.workshops ?? []).map((w) => ({ id: w.id, label: w.name, hint: w.code })), [md])

  function onAudioUploaded(res: AudioUploadResult) {
    setAudioId(res.audioId)
    if (res.transcript && !content.trim()) setContent(res.transcript)
    if (res.transcript) setTranscript(res.transcript)
  }

  function buildPayload() {
    return {
      projectId,
      workshopId,
      reportDate,
      title: title.trim(),
      content: content.trim(),
      transcript: transcript.trim() || null,
    }
  }

  function validate(): string | null {
    if (!workshopId) return 'کارگاه را انتخاب کنید.'
    if (!projectId) return 'پروژه را انتخاب کنید.'
    if (title.trim().length < 3) return 'عنوان گزارش را وارد کنید.'
    if (content.trim().length < 3) return 'متن گزارش را وارد کنید.'
    return null
  }

  async function save(submitAfter: boolean) {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    setSaving(true)
    try {
      let reportId = editId
      if (editId) {
        await api.patch(`/api/v1/daily-reports/${editId}`, buildPayload())
      } else {
        const res = await api.post<{ reportId: string; duplicate?: boolean }>('/api/v1/daily-reports', {
          ...buildPayload(),
          sourceType: audioId ? ('VOICE' as const) : ('MANUAL' as const),
          audioId,
          clientRequestId: crypto.randomUUID(),
        })
        reportId = res.reportId
      }
      if (submitAfter && reportId) {
        await api.post(`/api/v1/daily-reports/${reportId}/submit`, {})
        toast.success('گزارش برای مدیران ارسال شد.')
      } else {
        toast.success(editId ? 'گزارش به‌روزرسانی شد.' : 'پیش‌نویس گزارش ذخیره شد.')
      }
      navigate('daily-report-detail', { id: reportId as string }, true)
    } catch (e) {
      if (e instanceof ClientApiError) {
        if (e.code === 'OFFLINE_QUEUED') {
          toast.success('اتصال قطع است — گزارش در صف ارسال خودکار قرار گرفت')
          back()
          return
        }
        toast.error(e.message)
      } else toast.error('خطا در ذخیرهٔ گزارش.')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title={editId ? 'ویرایش گزارش' : 'گزارش روزانه'} onBack={back} />
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <ScreenHeader
        title={editId ? 'ویرایش گزارش روزانه' : 'گزارش روزانه جدید'}
        subtitle="گزارش امروز کارگاه به مدیر"
        onBack={back}
      />

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setSheet('workshop')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
            <span className="block text-[11px] text-muted-foreground mb-1">کارگاه</span>
            <span className="block text-sm font-medium truncate">{md?.workshops.find((w) => w.id === workshopId)?.name ?? 'انتخاب کنید'}</span>
          </button>
          <button type="button" onClick={() => setSheet('project')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
            <span className="block text-[11px] text-muted-foreground mb-1">پروژه</span>
            <span className="block text-sm font-medium truncate">{md?.projects.find((p) => p.id === projectId)?.name ?? 'انتخاب کنید'}</span>
          </button>
        </div>

        <button type="button" onClick={() => setSheet('date')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-16">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
            <CalendarDays className="size-3" />
            تاریخ گزارش
          </span>
          <span className="block text-sm font-medium">{formatJalaliFromISO(reportDate)}</span>
        </button>

        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان گزارش — مثلاً گزارش روزانهٔ کارگاه" className="h-12 bg-card" maxLength={200} />

        {/* صوت گزارش */}
        {!editId ? (
          <div className="space-y-2">
            <AudioRecorder onUploaded={onAudioUploaded} label="گزارش صوتی (اختیاری)" />
            <AudioHint transcribeStatus={transcript ? 'DONE' : audioId ? 'FAILED' : null} />
          </div>
        ) : null}

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="متن گزارش — پیشرفت امروز، مشکلات، نیازها…"
          className="bg-card leading-8"
          maxLength={8000}
        />
        {transcript && transcript !== content ? (
          <div className="rounded-xl border border-border bg-secondary/60 p-3">
            <p className="text-[11px] text-muted-foreground mb-1">متن خام استخراج‌شده از صوت (قابل ویرایش — در متن گزارش اعمال کنید):</p>
            <p className="text-xs leading-6 whitespace-pre-wrap">{transcript}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={() => setContent(transcript)}>
              <Pencil className="size-3" />
              جایگزینی متن گزارش با این متن
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5 sticky bottom-20">
          <Button type="button" variant="outline" className="h-12" onClick={() => setSheet('preview')}>
            <Eye className="size-4" />
            پیش‌نمایش
          </Button>
          <Button type="button" variant="outline" className="h-12" onClick={() => void save(false)} disabled={saving}>
            <Save className="size-4" />
            ذخیرهٔ پیش‌نویس
          </Button>
          <Button type="button" className="col-span-2 h-12 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void save(true)} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            ارسال نهایی گزارش
          </Button>
        </div>
      </div>

      {/* پیش‌نمایش */}
      {sheet === 'preview' ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setSheet(null)} role="dialog" aria-label="پیش‌نمایش گزارش">
          <div className="w-full max-w-lg mx-auto bg-card rounded-t-2xl p-5 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">پیش‌نمایش گزارش</p>
              <Button size="sm" variant="ghost" onClick={() => setSheet(null)}>بستن</Button>
            </div>
            <div className="rounded-xl border border-border p-4 space-y-2">
              <p className="font-bold">{title || '(بدون عنوان)'}</p>
              <p className="text-[11px] text-muted-foreground">
                {md?.workshops.find((w) => w.id === workshopId)?.name} · {md?.projects.find((p) => p.id === projectId)?.name} · {formatJalaliFromISO(reportDate)}
              </p>
              <p className="text-sm leading-7 whitespace-pre-wrap">{content || '(متن خالی)'}</p>
              {audioId ? <p className="text-[11px] text-accent">فایل صوتی پیوست شده است.</p> : null}
            </div>
            <Button className="w-full h-12 mt-4 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => setSheet(null)}>
              بازگشت به ویرایش
            </Button>
          </div>
        </div>
      ) : null}

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
      <JalaliCalendarSheet
        open={sheet === 'date'}
        onOpenChange={(v) => setSheet(v ? 'date' : null)}
        title="تاریخ گزارش"
        value={reportDate}
        onSelect={(iso) => setReportDate(iso)}
      />
    </div>
  )
}

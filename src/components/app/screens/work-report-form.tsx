"use client"

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Plus, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type MasterData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, SelectionSheet } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { todayISO, formatJalaliFromISO, toFa } from '@/lib/fa'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

type SheetKind = 'workshop' | 'project' | 'worker' | 'date' | null

function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

export default function WorkReportForm() {
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)
  const session = useApp((s) => s.session)

  // حالت خوداظهاری — نیروی اجرایی نام و کارگاهش از حسابش اجباری می‌شود
  const isFieldWorker = session?.user.role === 'FIELD_WORKER'
  const selfName = session?.linkedWorker?.fullName ?? null

  const [md, setMd] = useState<MasterData | null>(null)
  const [workshopId, setWorkshopId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [workerName, setWorkerName] = useState('')
  const [reportDate, setReportDate] = useState(todayISO())
  const [crewCount, setCrewCount] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api
      .get<MasterData>('/api/v1/master')
      .then((data) => {
        setMd(data)
        setWorkshopId(session?.workshops[0]?.id ?? data.workshops[0]?.id ?? '')
        if (isFieldWorker && selfName) {
          setWorkerName(selfName)
          setWorkerId(session?.user.workerId ?? '')
        }
        setLoaded(true)
      })
      .catch(() => toast.error(ERROR_MSG))
  }, [])

  const workshopOptions = useMemo(() => (md?.workshops ?? []).map((w) => ({ id: w.id, label: w.name, hint: w.code })), [md])
  const projectOptions = useMemo(
    () => (md?.projects ?? []).filter((p) => !workshopId || p.workshopId === null || p.workshopId === workshopId).map((p) => ({ id: p.id, label: p.name, hint: p.code })),
    [md, workshopId]
  )
  const workerOptions = useMemo(
    () => (md?.workers ?? []).map((w) => ({ id: w.id, label: w.fullName })),
    [md]
  )

  // انتخاب کارگر از فهرست — نام را خودکار پر می‌کند
  function onWorkerSelected(ids: string[]) {
    const w = md?.workers.find((x) => x.id === ids[0])
    if (w) {
      setWorkerId(w.id)
      setWorkerName(w.fullName)
    }
  }

  async function save() {
    const name = workerName.trim()
    if (!workshopId) {
      toast.error('کارگاه را انتخاب کنید.')
      return
    }
    if (name.length < 2) {
      toast.error('نام کارگر را وارد کنید.')
      return
    }
    if (content.trim().length < 3) {
      toast.error('شرح کار را بنویسید.')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/v1/work-reports', {
        workshopId,
        projectId: projectId || null,
        workerId: workerId || null,
        workerName: name,
        reportDate,
        content: content.trim(),
        crewCount: crewCount ? Number(toEnDigits(crewCount).replace(/[^\d]/g, '')) || null : null,
      })
      toast.success('گزارش کار ثبت شد.')
      navigate('work-reports', undefined, true)
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در ثبت گزارش کار.')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title="گزارش کار جدید" onBack={back} />
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <ScreenHeader
        title="گزارش کار جدید"
        subtitle={isFieldWorker ? 'کارِ امروز خودتان را اعلام کنید' : 'اعلام کار انجام‌شدهٔ کارگر برای مدیر'}
        onBack={back}
      />

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          {isFieldWorker ? (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 min-h-16">
              <span className="block text-[11px] text-muted-foreground mb-1">کارگاه شما</span>
              <span className="block text-sm font-medium truncate">{md?.workshops.find((w) => w.id === workshopId)?.name ?? '—'}</span>
            </div>
          ) : (
            <button type="button" onClick={() => setSheet('workshop')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
              <span className="block text-[11px] text-muted-foreground mb-1">کارگاه</span>
              <span className="block text-sm font-medium truncate">{md?.workshops.find((w) => w.id === workshopId)?.name ?? 'انتخاب کنید'}</span>
            </button>
          )}
          {isFieldWorker ? (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 min-h-16" />
          ) : (
            <button type="button" onClick={() => setSheet('project')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
              <span className="block text-[11px] text-muted-foreground mb-1">پروژه (اختیاری)</span>
              <span className="block text-sm font-medium truncate">{md?.projects.find((p) => p.id === projectId)?.name ?? 'انتخاب کنید'}</span>
            </button>
          )}
        </div>

        <button type="button" onClick={() => setSheet('date')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-16">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
            <CalendarDays className="size-3" />
            تاریخ کار
          </span>
          <span className="block text-sm font-medium">{formatJalaliFromISO(reportDate)}</span>
        </button>

        <div>
          <Input
            value={workerName}
            onChange={(e) => {
              if (isFieldWorker) return // نام خودش — غیرقابل تغییر
              setWorkerName(e.target.value)
              setWorkerId('')
            }}
            readOnly={isFieldWorker}
            placeholder="نام کارگر — مثلاً علی محمدی"
            className="h-12 bg-card"
            maxLength={120}
          />
          {isFieldWorker ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground px-1">گزارش به نام شما ثبت می‌شود (حساب متصل به پروفایل کارگر).</p>
          ) : (md?.workers ?? []).length > 0 ? (
            <button
              type="button"
              onClick={() => setSheet('worker')}
              className="mt-1.5 text-[11px] text-accent font-medium px-1 inline-flex items-center gap-1"
            >
              <Plus className="size-3" />
              انتخاب از فهرست کارگران ثبت‌شده
            </button>
          ) : null}
        </div>

        <Input
          value={crewCount}
          onChange={(e) => setCrewCount(e.target.value)}
          placeholder="تعداد نفرات گروه (اختیاری)"
          className="h-12 bg-card numeric-input"
          inputMode="numeric"
          maxLength={3}
        />

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="شرح کار انجام‌شده — مثلاً: قالب‌بندی ستون‌های طبقهٔ دوم را انجام داد…"
          className="bg-card leading-8"
          maxLength={4000}
        />
        <p className="text-[11px] text-muted-foreground px-1">
          {toFa(content.length)} از {toFa(4000)} نویسه
        </p>

        <Button
          type="button"
          className={cn('w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground sticky bottom-20')}
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          ثبت گزارش کار
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
        open={sheet === 'worker'}
        onOpenChange={(v) => setSheet(v ? 'worker' : null)}
        title="انتخاب کارگر"
        options={workerOptions}
        selected={workerId ? [workerId] : []}
        onConfirm={onWorkerSelected}
      />
      <JalaliCalendarSheet
        open={sheet === 'date'}
        onOpenChange={(v) => setSheet(v ? 'date' : null)}
        title="تاریخ کار"
        value={reportDate}
        onSelect={(iso) => setReportDate(iso)}
        disableFuture
      />
    </div>
  )
}

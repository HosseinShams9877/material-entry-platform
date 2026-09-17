"use client"

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Send, Loader2, CalendarDays, AlarmClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type DailyTaskDetail, type MasterDataWithSupervisors } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, SelectionSheet } from '@/components/app/shared'
import { JalaliCalendarSheet } from '@/components/app/jalali-calendar-sheet'
import { toFa, todayISO, formatJalaliFromISO, formatJalaliTehranToISO } from '@/lib/fa'
import { TASK_PRIORITIES } from '@/lib/permissions'
import { cn } from '@/lib/utils'

interface ItemDraft {
  key: string
  id: string | null
  title: string
  description: string
}

type SheetKind = 'project' | 'workshop' | 'assignees' | 'assignedDate' | 'dueDate' | null

export default function DailyTaskForm({ params }: { params?: Record<string, unknown> }) {
  const editId = typeof params?.id === 'string' ? params.id : null
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)

  const [md, setMd] = useState<MasterDataWithSupervisors | null>(null)
  const [loaded, setLoaded] = useState(editId === null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [workshopId, setWorkshopId] = useState('')
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [assignedDate, setAssignedDate] = useState(todayISO())
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [newItemTitle, setNewItemTitle] = useState('')

  // بارگذاری Master Data + دادهٔ ویرایش
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
      .get<{ task: DailyTaskDetail }>(`/api/v1/daily-tasks/${editId}`)
      .then(({ task }) => {
        setTitle(task.title)
        setDescription(task.description ?? '')
        setProjectId(task.projectId)
        setWorkshopId(task.workshopId)
        setPriority(task.priority as typeof priority)
        setAssigneeIds(task.assignees.map((a) => a.id))
        setAssignedDate(formatJalaliTehranToISO(task.assignedDate))
        if (task.dueDate) {
          setDueDate(formatJalaliTehranToISO(task.dueDate))
          setDueTime(new Date(task.dueDate).toISOString().slice(11, 16))
        }
        setItems(
          task.items.map((i) => ({
            key: i.id,
            id: i.id,
            title: i.title,
            description: i.description ?? '',
          }))
        )
        setLoaded(true)
      })
      .catch(() => {
        toast.error('وظیفه یافت نشد.')
        back()
      })
  }, [editId, back])

  const projectOptions = useMemo(
    () => (md?.projects ?? []).filter((p) => !workshopId || p.workshopId === null || p.workshopId === workshopId).map((p) => ({ id: p.id, label: p.name, hint: p.code })),
    [md, workshopId]
  )
  const workshopOptions = useMemo(() => (md?.workshops ?? []).map((w) => ({ id: w.id, label: w.name, hint: w.code })), [md])
  const supervisorOptions = useMemo(
    () =>
      (md?.supervisors ?? [])
        .filter((s) => !workshopId || s.workshopId === workshopId)
        .map((s) => ({ id: s.id, label: s.fullName })),
    [md, workshopId]
  )

  function addManualItem() {
    const t = newItemTitle.trim()
    if (t.length < 2) return
    setItems((prev) => [...prev, { key: `new-${Date.now()}-${prev.length}`, id: null, title: t, description: '' }])
    setNewItemTitle('')
  }

  function moveItem(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function buildPayload() {
    return {
      projectId,
      workshopId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      assignedDate,
      dueDate:
        dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
          ? new Date(`${dueDate}T${dueTime && /^\d{2}:\d{2}$/.test(dueTime) ? dueTime : '23:59'}:00+03:30`).toISOString()
          : null,
      assigneeIds,
      items: items
        .filter((it) => it.title.trim().length >= 2)
        .map((it, idx) => ({ id: it.id, title: it.title.trim(), description: it.description.trim() || null, sortOrder: idx })),
    }
  }

  function validate(): string | null {
    if (title.trim().length < 3) return 'عنوان وظیفه را وارد کنید.'
    if (!projectId) return 'پروژه را انتخاب کنید.'
    if (!workshopId) return 'کارگاه را انتخاب کنید.'
    if (!assignedDate) return 'تاریخ وظیفه را انتخاب کنید.'
    return null
  }

  async function save(sendAfter: boolean) {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    setSaving(true)
    try {
      let taskId = editId
      if (editId) {
        const payload = buildPayload()
        await api.patch(`/api/v1/daily-tasks/${editId}`, payload)
      } else {
        const res = await api.post<{ taskId: string }>('/api/v1/daily-tasks', buildPayload())
        taskId = res.taskId
      }
      if (sendAfter && taskId) {
        if (assigneeIds.length === 0) {
          toast.error('برای ارسال، حداقل یک سرپرست انتخاب کنید.')
          setSaving(false)
          return
        }
        await api.post(`/api/v1/daily-tasks/${taskId}/send`, { assigneeIds })
        toast.success('وظیفه برای سرپرستان ارسال شد.')
      } else {
        toast.success(sendAfter === false && !editId ? 'پیش‌نویس ذخیره شد.' : 'وظیفه به‌روزرسانی شد.')
      }
      navigate('daily-task-detail', { id: taskId as string }, true)
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در ذخیرهٔ وظیفه.')
    } finally {
      setSaving(false)
    }
  }

  const assigneeNames = (md?.supervisors ?? []).filter((s) => assigneeIds.includes(s.id)).map((s) => s.fullName)

  if (!loaded) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title={editId ? 'ویرایش وظیفه' : 'وظیفهٔ جدید'} onBack={back} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <ScreenHeader
        title={editId ? 'ویرایش وظیفه' : 'وظیفهٔ روزانه جدید'}
        subtitle="پس از ارسال، سرپرست اعلان دریافت می‌کند"
        onBack={back}
      />

      <div className="p-4 space-y-4">
        {/* انتخاب‌ها */}
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

        <button type="button" onClick={() => setSheet('assignees')} className="w-full rounded-xl border border-border bg-card p-3 text-right min-h-16">
          <span className="block text-[11px] text-muted-foreground mb-1">سرپرست یا سرپرستان (گیرنده)</span>
          <span className="block text-sm font-medium truncate">
            {assigneeNames.length > 0 ? assigneeNames.join('، ') : 'انتخاب کنید'}
          </span>
        </button>

        {/* تاریخ‌ها */}
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setSheet('assignedDate')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
              <CalendarDays className="size-3" />
              تاریخ وظیفه
            </span>
            <span className="block text-sm font-medium">{formatJalaliFromISO(assignedDate)}</span>
          </button>
          <button type="button" onClick={() => setSheet('dueDate')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
              <AlarmClock className="size-3" />
              مهلت انجام (اختیاری)
            </span>
            <span className="block text-sm font-medium">{dueDate ? `${formatJalaliFromISO(dueDate)}${dueTime ? ` — ${toFa(dueTime)}` : ''}` : 'انتخاب کنید'}</span>
          </button>
        </div>

        {/* عنوان و توضیح */}
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان وظیفه — مثلاً شمارش میلگردهای انبار ۲" className="h-12 bg-card" maxLength={200} />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="توضیحات (اختیاری)" rows={2} className="bg-card leading-7" maxLength={2000} />
        </div>

        {/* اولویت */}
        <div>
          <p className="text-xs font-medium mb-1.5">اولویت</p>
          <div className="flex gap-2">
            {(Object.keys(TASK_PRIORITIES) as Array<keyof typeof TASK_PRIORITIES>).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                  priority === p ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border text-muted-foreground'
                )}
              >
                {TASK_PRIORITIES[p]}
              </button>
            ))}
          </div>
        </div>

        {/* آیتم‌های اجرایی */}
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-medium mb-2">آیتم‌های اجرایی</p>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground pb-2">هیچ آیتمی اضافه نشده است — از کادر پایین اضافه کنید.</p>
          ) : (
            <div className="space-y-2 mb-2">
              {items.map((it, idx) => (
                <div key={it.key} className="rounded-lg border border-border bg-background/60 p-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] font-bold text-muted-foreground mt-2 shrink-0">{toFa(idx + 1)}.</span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Input
                        value={it.title}
                        onChange={(e) => setItems((prev) => prev.map((p) => (p.key === it.key ? { ...p, title: e.target.value } : p)))}
                        className="h-9 text-sm bg-card"
                        placeholder="عنوان آیتم"
                        maxLength={200}
                      />
                      <Input
                        value={it.description}
                        onChange={(e) => setItems((prev) => prev.map((p) => (p.key === it.key ? { ...p, description: e.target.value } : p)))}
                        className="h-8 text-xs bg-card"
                        placeholder="توضیح تکمیلی (اختیاری)"
                        maxLength={500}
                      />
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button type="button" onClick={() => moveItem(idx, -1)} className="text-muted-foreground p-1" aria-label="انتقال به بالا">
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => moveItem(idx, 1)} className="text-muted-foreground p-1" aria-label="انتقال به پایین">
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((p) => p.key !== it.key))}
                      className="text-red-500 p-1.5 shrink-0"
                      aria-label="حذف آیتم"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addManualItem()
                }
              }}
              placeholder="افزودن آیتم اجرایی…"
              className="h-10 bg-background/60"
            />
            <Button type="button" variant="outline" size="icon" className="size-10 shrink-0" onClick={addManualItem} aria-label="افزودن">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {/* دکمه‌ها */}
        <div className="grid grid-cols-2 gap-2.5 sticky bottom-20">
          <Button type="button" variant="outline" className="h-12" onClick={() => void save(false)} disabled={saving}>
            <Save className="size-4" />
            ذخیرهٔ پیش‌نویس
          </Button>
          <Button type="button" className="h-12 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void save(true)} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            ارسال وظیفه
          </Button>
        </div>
      </div>

      {/* شیت‌های انتخاب */}
      <SelectionSheet
        open={sheet === 'workshop'}
        onOpenChange={(v) => setSheet(v ? 'workshop' : null)}
        title="انتخاب کارگاه"
        options={workshopOptions}
        selected={[workshopId]}
        onConfirm={(ids) => {
          setWorkshopId(ids[0] ?? '')
          // پروژهٔ ناسازگار پاک شود
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
        open={sheet === 'assignees'}
        onOpenChange={(v) => setSheet(v ? 'assignees' : null)}
        title="انتخاب سرپرستان"
        options={supervisorOptions}
        selected={assigneeIds}
        multi
        onConfirm={(ids) => setAssigneeIds(ids)}
      />
      <JalaliCalendarSheet
        open={sheet === 'assignedDate'}
        onOpenChange={(v) => setSheet(v ? 'assignedDate' : null)}
        title="تاریخ وظیفه"
        value={assignedDate}
        onSelect={(iso) => setAssignedDate(iso)}
        disableFuture={false}
      />
      <JalaliCalendarSheet
        open={sheet === 'dueDate'}
        onOpenChange={(v) => setSheet(v ? 'dueDate' : null)}
        title="مهلت انجام"
        value={dueDate || assignedDate}
        onSelect={(iso) => setDueDate(iso)}
        disableFuture={false}
      />
    </div>
  )
}

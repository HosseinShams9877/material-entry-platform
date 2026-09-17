"use client"

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays, AlarmClock, Check, Loader2, MessageSquarePlus, Pencil, Send, Ban,
  CheckCheck, User, Clock, Camera,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type DailyTaskDetail } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, TaskStatusBadge } from '@/components/app/shared'
import { TaskProgress } from '@/components/app/daily-shared'
import { formatJalaliDateTime, formatJalaliTehran, formatRelative, toFa } from '@/lib/fa'
import { cn } from '@/lib/utils'
import { ERROR_MSG } from '@/components/app/messages'

export default function DailyTaskDetailScreen({ params }: { params?: Record<string, unknown> }) {
  const id = typeof params?.id === 'string' ? params.id : null
  const [task, setTask] = useState<DailyTaskDetail | null>(null)
  const [error, setError] = useState('')
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [comment, setComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [busyAction, setBusyAction] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [uploadingItem, setUploadingItem] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null)
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await api.get<{ task: DailyTaskDetail }>(`/api/v1/daily-tasks/${id}`)
      setTask(res.task)
      setError('')
    } catch {
      setError(ERROR_MSG)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function uploadPhoto(itemId: string, file: File) {
    setUploadingItem(itemId)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.upload(`/api/v1/daily-tasks/items/${itemId}/photo`, fd)
      toast.success('عکس اثبات بارگذاری شد')
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : 'بارگذاری عکس ناموفق بود')
    } finally {
      setUploadingItem(null)
    }
  }

  async function deletePhoto(photoId: string) {
    try {
      await api.del(`/api/v1/daily-photos/${photoId}`)
      setPreview(null)
      toast.success('عکس حذف شد')
      await load()
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : 'حذف عکس ناموفق بود')
    }
  }

  async function tickItem(itemId: string, note: string | null) {
    if (!id || !task) return
    setBusyItem(itemId)
    try {
      await api.post(`/api/v1/daily-tasks/${id}/items/${itemId}/complete`, note ? { note } : {})
      toast.success('انجام آیتم ثبت شد.')
      setNoteFor(null)
      setNoteText('')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در ثبت انجام.')
    } finally {
      setBusyItem(null)
    }
  }

  async function untickItem(itemId: string) {
    if (!id || !task) return
    setBusyItem(itemId)
    try {
      await api.post(`/api/v1/daily-tasks/${id}/items/${itemId}/uncomplete`, {})
      toast.success('تیک آیتم برداشته شد.')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در برداشتن تیک.')
    } finally {
      setBusyItem(null)
    }
  }

  async function completeAll() {
    if (!id) return
    setBusyAction(true)
    try {
      await api.post(`/api/v1/daily-tasks/${id}/complete`, noteText.trim() ? { note: noteText.trim() } : {})
      toast.success('وظیفه تکمیل شد. مدیر پروژه اعلان می‌گیرد.')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در تکمیل وظیفه.')
    } finally {
      setBusyAction(false)
    }
  }

  async function sendTask() {
    if (!id) return
    setBusyAction(true)
    try {
      await api.post(`/api/v1/daily-tasks/${id}/send`, {})
      toast.success('وظیفه ارسال شد.')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در ارسال.')
    } finally {
      setBusyAction(false)
    }
  }

  async function cancelTask() {
    if (!id) return
    setBusyAction(true)
    try {
      await api.post(`/api/v1/daily-tasks/${id}/cancel`, { reason: cancelReason.trim() })
      toast.success('وظیفه لغو شد.')
      setCancelOpen(false)
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در لغو.')
    } finally {
      setBusyAction(false)
    }
  }

  async function sendComment() {
    if (!id) return
    const text = comment.trim()
    if (!text) return
    setSendingComment(true)
    try {
      await api.post(`/api/v1/daily-tasks/${id}/comments`, { content: text })
      setComment('')
      await load()
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در ثبت دیدگاه.')
    } finally {
      setSendingComment(false)
    }
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title="جزئیات وظیفه" onBack={back} />
        <p className="text-center text-sm text-muted-foreground py-16">{error}</p>
      </div>
    )
  }
  if (!task) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title="جزئیات وظیفه" onBack={back} />
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-10">
      <ScreenHeader
        title="جزئیات وظیفه"
        subtitle={task.workshopName}
        onBack={back}
        right={
          task.canEdit ? (
            <Button size="icon" variant="ghost" className="size-10" onClick={() => navigate('daily-task-form', { id: task.id })} aria-label="ویرایش">
              <Pencil className="size-4" />
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 space-y-4">
        {/* سربرگ */}
        <div className={cn('rounded-2xl border p-4', task.isOverdue ? 'border-red-200 bg-red-50/50' : 'border-border bg-card')}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <TaskStatusBadge status={task.status} />
            {task.isOverdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px] font-medium">
                <AlarmClock className="size-3" />
                دارای تأخیر
              </span>
            ) : null}
          </div>
          <h2 className="text-base font-bold leading-7">{task.title}</h2>
          {task.description ? <p className="text-sm text-muted-foreground leading-6 mt-1.5 whitespace-pre-wrap">{task.description}</p> : null}

          <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="size-3" />
              فرستنده: {task.createdByName}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" />
              {formatJalaliTehran(task.assignedDate)}
            </span>
            {task.dueDate ? (
              <span className={cn('flex items-center gap-1', task.isOverdue && 'text-red-600 font-medium')}>
                <AlarmClock className="size-3" />
                مهلت: {formatJalaliDateTime(task.dueDate)}
              </span>
            ) : null}
            <span className="flex items-center gap-1">پروژه: {task.projectName}</span>
          </div>

          {task.assignees.length > 0 ? (
            <p className="text-[11px] text-muted-foreground mt-2">
              گیرنده: {task.assignees.map((a) => a.fullName).join('، ')}
            </p>
          ) : null}

          <div className="mt-3">
            <TaskProgress value={task.progress} />
          </div>
        </div>

        {/* اعلان‌های وضعیت ویژه */}
        {task.status === 'CANCELLED' && task.cancelReason ? (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">علت لغو: {task.cancelReason}</div>
        ) : null}
        {task.status === 'COMPLETED' && task.completedAt ? (
          <div className="rounded-xl bg-green-50 border border-green-200 text-green-700 px-3 py-2 text-sm">
            تکمیل: {formatJalaliDateTime(task.completedAt)}
            {task.completedByName ? ` — ${task.completedByName}` : ''}
            {task.completionNote ? ` — ${task.completionNote}` : ''}
          </div>
        ) : null}

        {/* آیتم‌ها */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            آیتم‌های اجرایی {task.items.length > 0 ? `(${toFa(task.items.filter((i) => i.isCompleted).length)} از ${toFa(task.items.length)})` : ''}
          </p>
          {task.items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">این وظیفه آیتم مجزا ندارد — با دکمهٔ پایین کل وظیفه را تکمیل کنید.</p>
          ) : (
            task.items.map((item, idx) => (
              <div key={item.id} className={cn('rounded-xl border p-3', item.isCompleted ? 'border-green-200 bg-green-50/50' : 'border-border bg-card')}>
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    disabled={!task.canComplete || busyItem !== null}
                    onClick={() => (item.isCompleted ? void untickItem(item.id) : setNoteFor(item.id))}
                    className={cn(
                      'mt-0.5 size-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                      item.isCompleted ? 'bg-green-600 border-green-600' : task.canComplete ? 'border-zinc-400 active:scale-95' : 'border-zinc-200 opacity-60'
                    )}
                    aria-label={item.isCompleted ? 'برداشتن تیک' : 'علامت‌زدن انجام‌شده'}
                  >
                    {item.isCompleted ? <Check className="size-4 text-white" /> : null}
                    {busyItem === item.id ? <Loader2 className="size-4 animate-spin text-zinc-500 absolute" /> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm leading-6', item.isCompleted && 'line-through text-muted-foreground')}>
                      {toFa(idx + 1)}. {item.title}
                    </p>
                    {item.description ? <p className="text-xs text-muted-foreground mt-0.5 leading-5">{item.description}</p> : null}
                    {item.isCompleted && item.completedAt ? (
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-green-700">
                        <Clock className="size-3" />
                        {formatJalaliDateTime(item.completedAt)}
                        {item.completedByName ? ` — ${item.completedByName}` : ''}
                      </div>
                    ) : null}
                    {item.completionNote ? <p className="text-[11px] text-muted-foreground mt-0.5">توضیح: {item.completionNote}</p> : null}

                    {/* عکس‌های اثبات انجام */}
                    {item.photos.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.photos.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPreview({ id: p.id, url: p.url })}
                            className="size-14 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100 flex items-center justify-center active:scale-95 transition-transform"
                            aria-label={`مشاهدهٔ عکس ${p.fileName}`}
                          >
                            <img src={p.url} alt={p.fileName} className="size-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {/* آپلود عکس اثبات */}
                    {task.canComplete ? (
                      <label
                        className={cn(
                          'inline-flex items-center gap-1.5 text-[11px] text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-2 py-1 mt-2 cursor-pointer select-none',
                          uploadingItem === item.id && 'opacity-60 pointer-events-none'
                        )}
                      >
                        {uploadingItem === item.id ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                        {item.photos.length > 0 ? 'افزودن عکس بیشتر' : 'عکس اثبات انجام'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            e.target.value = ''
                            if (f) void uploadPhoto(item.id, f)
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* یادداشت تکمیل کل */}
        {task.canComplete ? (
          <div className="space-y-2">
            <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} placeholder="توضیح انجام کار (اختیاری)" className="bg-card leading-7" maxLength={500} />
            <Button type="button" className="w-full h-12 bg-green-600 hover:bg-green-500 text-white" onClick={() => void completeAll()} disabled={busyAction}>
              {busyAction ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
              تکمیل همهٔ آیتم‌ها و پایان وظیفه
            </Button>
          </div>
        ) : null}

        {/* اقدامات مدیر */}
        {task.canSend || task.canCancel ? (
          <div className="grid grid-cols-2 gap-2.5">
            {task.canSend ? (
              <Button type="button" variant="outline" className="h-11" onClick={() => void sendTask()} disabled={busyAction}>
                <Send className="size-4" />
                {task.status === 'DRAFT' ? 'ارسال وظیفه' : 'ارسال مجدد'}
              </Button>
            ) : null}
            {task.canCancel ? (
              <Button type="button" variant="outline" className="h-11 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setCancelOpen(true)}>
                <Ban className="size-4" />
                لغو وظیفه
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* لغو */}
        {cancelOpen ? (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2">
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} placeholder="علت لغو وظیفه…" className="bg-card leading-7" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-10" onClick={() => setCancelOpen(false)}>انصراف</Button>
              <Button className="h-10 bg-red-600 hover:bg-red-500 text-white" onClick={() => void cancelTask()} disabled={busyAction || cancelReason.trim().length < 3}>
                ثبت لغو
              </Button>
            </div>
          </div>
        ) : null}

        {/* گفتگو */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">گفتگو ({toFa(task.comments.length)})</p>
          {task.comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{c.userName}</span>
                <span className="text-[11px] text-muted-foreground">{formatRelative(c.createdAt)}</span>
              </div>
              <p className="text-sm leading-6 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="افزودن دیدگاه…" className="bg-card leading-7" maxLength={1000} />
            <Button type="button" size="icon" className="size-11 shrink-0 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void sendComment()} disabled={sendingComment || !comment.trim()} aria-label="ارسال دیدگاه">
              {sendingComment ? <Loader2 className="size-4 animate-spin" /> : <MessageSquarePlus className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* شیت ثبت توضیح آیتم */}
      {noteFor ? (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl border-t border-border p-4 pb-8 max-w-lg mx-auto" role="dialog" aria-label="ثبت توضیح انجام">
          <p className="text-sm font-semibold mb-2">توضیح انجام کار (اختیاری)</p>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} className="bg-secondary leading-7" autoFocus />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button variant="outline" className="h-11" onClick={() => { setNoteFor(null); setNoteText('') }}>
              تیک بدون توضیح
            </Button>
            <Button className="h-11 bg-green-600 hover:bg-green-500 text-white" onClick={() => noteFor && void tickItem(noteFor, noteText.trim() || null)}>
              ثبت انجام
            </Button>
          </div>
        </div>
      ) : null}

      {/* نمایش تمام‌صفحهٔ عکس اثبات */}
      {preview ? (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
          role="dialog"
          aria-label="نمایش عکس اثبات"
          onClick={() => setPreview(null)}
        >
          <img src={preview.url} alt="عکس اثبات انجام" className="max-h-[80vh] max-w-[94vw] rounded-lg object-contain" />
          <p className="text-xs text-zinc-300 mt-3">برای بستن ضربه بزنید</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-10 border-zinc-600 bg-zinc-800/60 text-zinc-200 hover:bg-zinc-700"
            onClick={(e) => {
              e.stopPropagation()
              void deletePhoto(preview.id)
            }}
          >
            حذف عکس
          </Button>
        </div>
      ) : null}
    </div>
  )
}

"use client"

// ─────────────────────────── کامپوننت‌های مشترک ماژول وظایف روزانه ───────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Paperclip, Loader2, Play, Pause, AudioLines, FileUp, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api, ClientApiError, type AudioUploadResult } from '@/lib/client'
import { toFa } from '@/lib/fa'
import { cn } from '@/lib/utils'

export const AUDIO_MAX_MB = 15

// ─────────────────────────── ضبط و انتخاب فایل صوتی ───────────────────────────

export function AudioRecorder({
  onUploaded,
  label = 'دستور صوتی',
}: {
  onUploaded: (result: AudioUploadResult) => void
  label?: string
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [seconds, setSeconds] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function startTimer() {
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
  }
  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  async function upload(blob: Blob, fileName: string) {
    setPhase('uploading')
    try {
      const form = new FormData()
      form.append('audio', blob, fileName)
      const res = await api.upload<AudioUploadResult>('/api/v1/daily-tasks/audio', form)
      if (res.transcribeStatus === 'FAILED') {
        toast.warning('تبدیل صوت به متن انجام نشد — می‌توانید متن را دستی وارد کنید.')
      } else {
        toast.success('صوت ثبت و به متن تبدیل شد.')
      }
      onUploaded(res)
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error('خطا در ثبت صدا. اتصال اینترنت را بررسی کنید.')
    } finally {
      setPhase('idle')
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined,
      })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > AUDIO_MAX_MB * 1024 * 1024) {
          toast.error('فایل صوتی بیش از حد مجاز است.')
          setPhase('idle')
          return
        }
        void upload(blob, 'voice.webm')
      }
      recorder.start()
      mediaRef.current = recorder
      setPhase('recording')
      startTimer()
    } catch {
      toast.error('دسترسی به میکروفون داده نشد. از تنظیمات مرورگر اجازه دهید.')
    }
  }

  function stopRecording() {
    mediaRef.current?.stop()
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop())
    stopTimer()
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > AUDIO_MAX_MB * 1024 * 1024) {
      toast.error(`حجم فایل بیش از ${toFa(AUDIO_MAX_MB)} مگابایت است.`)
      e.target.value = ''
      return
    }
    void upload(file, file.name)
    e.target.value = ''
  }

  const timeLabel = `${toFa(Math.floor(seconds / 60))}:${toFa(String(seconds % 60).padStart(2, '0'))}`

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <AudioLines className="size-4 text-accent" />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">MP3/WAV/WebM/OGG — حداکثر {toFa(AUDIO_MAX_MB)} مگابایت</span>
      </div>
      {phase === 'idle' ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 h-11" onClick={startRecording}>
            <Mic className="size-4" />
            ضبط صدا
          </Button>
          <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" />
            انتخاب فایل
          </Button>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFilePicked} aria-label="انتخاب فایل صوتی" />
        </div>
      ) : phase === 'recording' ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={stopRecording}
            className="size-11 rounded-full bg-red-500 flex items-center justify-center mic-pulse active:scale-95 transition-transform"
            aria-label="پایان ضبط"
          >
            <Square className="size-4 text-white fill-white" />
          </button>
          <span className="text-lg font-bold numeric-input">{timeLabel}</span>
          <span className="text-xs text-muted-foreground">در حال ضبط… برای پایان لمس کنید</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">در حال ارسال و تبدیل به متن…</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── پخش فایل صوتی (Signed URL) ───────────────────────────

export function AudioPlayer({
  audioUrl,
  fileName,
  dark = false,
}: {
  audioUrl: string
  fileName?: string
  dark?: boolean
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      void el.play().catch(() => setError(true))
    }
  }

  if (error) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-xs', dark ? 'bg-zinc-800 text-zinc-300' : 'bg-secondary text-muted-foreground')}>
        <AlertTriangle className="size-4" />
        فایل صوتی در دسترس نیست یا پیوند منقضی شده است.
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2', dark ? 'bg-zinc-800' : 'bg-secondary')}>
      <button
        type="button"
        onClick={toggle}
        className={cn('size-9 rounded-full flex items-center justify-center shrink-0', dark ? 'bg-amber-500 text-zinc-900' : 'bg-accent text-accent-foreground')}
        aria-label={playing ? 'توقف پخش' : 'پخش'}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium truncate', dark ? 'text-zinc-200' : '')}>{fileName ?? 'فایل صوتی'}</p>
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onError={() => setError(true)}
          className="hidden"
        />
      </div>
      <AudioLines className={cn('size-4 shrink-0', dark ? 'text-amber-500' : 'text-accent')} />
    </div>
  )
}

// ─────────────────────────── نوار پیشرفت وظیفه ───────────────────────────

export function TaskProgress({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn('h-full rounded-full transition-all', value === 100 ? 'bg-green-600' : 'bg-amber-500')}
          style={{ width: `${value}%` }}
        />
      </div>
      {showLabel ? <span className="text-[11px] text-muted-foreground shrink-0">{toFa(value)}٪</span> : null}
    </div>
  )
}

// ─────────────────────────── خالی/بارگذاری صوتی در پاسخ ───────────────────────────

export function AudioHint({ transcribeStatus }: { transcribeStatus: string | null }) {
  if (transcribeStatus !== 'FAILED') return null
  return (
    <div className="flex items-start gap-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 px-3 py-2">
      <AlertTriangle className="size-4 mt-0.5 shrink-0" />
      <p className="text-xs leading-5">
        تبدیل صوت به متن انجام نشد؛ فایل صوتی حفظ شده است. لطفاً متن را به‌صورت دستی وارد کنید.
      </p>
    </div>
  )
}

export { Mic, Paperclip }

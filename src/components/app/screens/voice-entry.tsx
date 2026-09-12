"use client"

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, RotateCcw, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type VoiceDraft } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader } from '@/components/app/shared'
import { toFa } from '@/lib/fa'

type Phase = 'ready' | 'recording' | 'transcribing' | 'transcript' | 'extracting'

export default function VoiceEntry() {
  const [phase, setPhase] = useState<Phase>('ready')
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [transcriptId, setTranscriptId] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const navigate = useApp((s) => s.navigate)
  const back = useApp((s) => s.back)

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
      recorder.onstop = () => void submitAudio(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
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

  async function submitAudio(blob: Blob) {
    setPhase('transcribing')
    try {
      const form = new FormData()
      form.append('audio', blob, 'voice.webm')
      const res = await api.upload<{ transcript: string; transcriptId: string }>('/api/v1/voice/transcribe', form)
      if (!res.transcript.trim()) {
        toast.error('متنی از صدای شما شنیده نشد. دوباره تلاش کنید.')
        setPhase('ready')
        return
      }
      setTranscript(res.transcript)
      setTranscriptId(res.transcriptId)
      setPhase('transcript')
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error('خطا در ارسال صدا. اتصال اینترنت را بررسی کنید.')
      setPhase('ready')
    }
  }

  async function extract() {
    setPhase('extracting')
    try {
      const res = await api.post<{ draft: VoiceDraft }>('/api/v1/voice/extract', {
        transcript,
        transcriptId,
      })
      navigate('voice-preview', { draft: res.draft })
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error('خطا در پردازش هوشمند.')
      setPhase('transcript')
    }
  }

  const timeLabel = `${toFa(Math.floor(seconds / 60))}:${toFa(String(seconds % 60).padStart(2, '0'))}`

  return (
    <div className="max-w-lg mx-auto min-h-dvh flex flex-col">
      <ScreenHeader title="ثبت با صدا" subtitle="طبیعی صحبت کنید — سیستم اطلاعات را استخراج می‌کند" onBack={back} />

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {phase === 'ready' ? (
          <>
            <div className="size-32 rounded-full bg-amber-500/10 flex items-center justify-center mb-8">
              <Mic className="size-14 text-accent" />
            </div>
            <p className="text-center text-sm text-muted-foreground leading-7 mb-2 max-w-xs">
              مثال:
            </p>
            <div className="bg-card border border-border rounded-xl p-4 mb-8 max-w-xs w-full">
              <p className="text-sm text-center leading-8">
                «پنجاه کیسه سیمان تیپ دو از شرکت X برای پروژه سعادت‌آباد آوردیم، علی و حسن تخلیه کردن و فاکتور هم دارم.»
              </p>
            </div>
            <Button onClick={startRecording} className="h-14 px-10 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-900 font-bold text-base">
              <Mic className="size-5" />
              شروع ضبط
            </Button>
          </>
        ) : null}

        {phase === 'recording' ? (
          <>
            <button
              type="button"
              onClick={stopRecording}
              className="size-32 rounded-full bg-red-500 flex items-center justify-center mic-pulse mb-8 active:scale-95 transition-transform"
              aria-label="پایان ضبط"
            >
              <Square className="size-10 text-white fill-white" />
            </button>
            <p className="text-2xl font-bold numeric-input">{timeLabel}</p>
            <p className="text-sm text-muted-foreground mt-2">در حال ضبط… برای پایان لمس کنید</p>
          </>
        ) : null}

        {phase === 'transcribing' ? (
          <ProcessingState title="در حال تبدیل صدا به متن…" hint="چند لحظه صبر کنید" />
        ) : null}

        {phase === 'extracting' ? (
          <ProcessingState title="در حال استخراج اطلاعات…" hint="AI اطلاعات را از متن شما جدا می‌کند" />
        ) : null}

        {phase === 'transcript' ? (
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="size-4 text-accent" />
              <p className="text-sm font-medium">متنی که شنیدیم — اشتباهی دارد؟ اصلاحش کنید:</p>
            </div>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={5}
              className="text-sm leading-7 bg-card"
            />
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <Button variant="outline" onClick={() => setPhase('ready')} className="h-12">
                <RotateCcw className="size-4" />
                ضبط مجدد
              </Button>
              <Button onClick={extract} className="h-12 bg-accent hover:bg-accent/90 text-accent-foreground">
                <Sparkles className="size-4" />
                استخراج اطلاعات
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* پیام امنیتی */}
      <p className="text-center text-[11px] text-muted-foreground pb-6 px-8">
        هیچ اطلاعاتی بدون تأیید شما ذخیره نمی‌شود — ابتدا پیش‌نمایش را می‌بینید
      </p>
    </div>
  )
}

function ProcessingState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-6">
        <div className="size-24 rounded-full bg-amber-500/10" />
        <Loader2 className="size-10 text-accent animate-spin absolute inset-0 m-auto" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground mt-1">{hint}</p>
    </div>
  )
}

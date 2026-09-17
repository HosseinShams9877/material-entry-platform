"use client"

// ─────────────────────────── پد امضا — رسم امضای مدیر کل ───────────────────────────
// Canvas ساده با Pointer Events — بدون هیچ وابستگی خارجی.
// خروجی: dataURL تصویر PNG (پس‌زمینهٔ سفید برای خوانایی چاپ).

import { useEffect, useRef, useState } from 'react'
import { Eraser, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SignaturePadProps {
  open: boolean
  onDone: (dataUrl: string) => void
  onCancel: () => void
  busy?: boolean
}

export function SignaturePad({ open, onDone, onCancel, busy = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const dirtyRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // پس‌زمینهٔ سفید — با devicePixelRatio برای خطوط نرم
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#18181b'
    dirtyRef.current = false
  }, [open])

  function pos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastRef.current = pos(e)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const last = lastRef.current
    if (!ctx || !last) return
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
    if (!dirtyRef.current) {
      dirtyRef.current = true
      setHasInk(true)
    }
  }

  function end() {
    drawingRef.current = false
    lastRef.current = null
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    dirtyRef.current = false
    setHasInk(false)
  }

  function confirm() {
    const canvas = canvasRef.current
    if (!canvas || !dirtyRef.current) return
    onDone(canvas.toDataURL('image/png'))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" role="dialog" aria-label="امضای مدیر کل">
      <div className="w-full max-w-lg mx-auto bg-card rounded-t-2xl p-4 pb-6">
        <div className="mb-3">
          <p className="font-bold text-sm">امضای مدیر کل</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            امضای خود را در کادر زیر رسم کنید — پس از ثبت، صورت وضعیت نهایی می‌شود.
          </p>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full h-44 rounded-xl border-2 border-dashed border-border bg-white touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />

        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <Button type="button" variant="outline" className="h-12" onClick={clear} disabled={busy}>
            <Eraser className="size-4" />
            پاک کردن
          </Button>
          <Button
            type="button"
            className="h-12 bg-green-600 hover:bg-green-500 text-white"
            onClick={confirm}
            disabled={!hasInk || busy}
          >
            <Check className="size-4" />
            ثبت امضا
          </Button>
        </div>
        <Button type="button" variant="ghost" className="w-full h-10 mt-1 text-muted-foreground" onClick={onCancel} disabled={busy}>
          انصراف
        </Button>
      </div>
    </div>
  )
}

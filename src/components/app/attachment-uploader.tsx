"use client"

import { useRef, useState } from 'react'
import { Camera, Paperclip, FileText, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ClientApiError } from '@/lib/client'
import { ATTACHMENT_KINDS } from '@/lib/permissions'
import { formatQty } from '@/lib/fa'
import { SelectionSheet } from '@/components/app/shared'

export interface UploadedAttachment {
  id: string
  kind: string
  fileName: string
  mimeType: string
  size: number
  url: string
}

/** آپلود امن پیوست: دوربین یا فایل + انتخاب نوع مدرک — اعتبارسنجی سمت سرور */
export function AttachmentUploader({
  entryId,
  attachments,
  onChange,
}: {
  entryId: string | null
  attachments: UploadedAttachment[]
  onChange: (files: UploadedAttachment[]) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [kindOpen, setKindOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  function pickFile(f: File | null) {
    if (!f) return
    if (f.size > 10 * 1024 * 1024) {
      toast.error('حجم فایل بیش از ۱۰ مگابایت است.')
      return
    }
    setPendingFile(f)
    setKindOpen(true)
  }

  async function uploadWithKind(kind: string) {
    if (!pendingFile) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      form.append('kind', kind)
      form.append('entryId', entryId ?? '')
      const uploaded = await api.upload<UploadedAttachment>('/api/v1/attachments', form)
      onChange([...attachments, uploaded])
      toast.success('مدرک پیوست شد.')
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error('خطا در آپلود فایل.')
    } finally {
      setUploading(false)
      setPendingFile(null)
    }
  }

  async function removeFile(id: string) {
    try {
      const res = await fetch(`/api/v1/attachments/${id}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
      })
      if (res.ok) {
        onChange(attachments.filter((a) => a.id !== id))
        toast.success('مدرک حذف شد.')
      } else {
        toast.error('خطا در حذف مدرک.')
      }
    } catch {
      toast.error('خطا در حذف مدرک.')
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center gap-2 min-h-24 justify-center active:scale-[0.98] transition-transform"
        >
          <Camera className="size-6 text-accent" />
          <span className="text-xs font-medium">دوربین</span>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-border bg-card p-4 flex flex-col items-center gap-2 min-h-24 justify-center active:scale-[0.98] transition-transform"
        >
          {uploading ? <Loader2 className="size-6 text-accent animate-spin" /> : <Paperclip className="size-6 text-accent" />}
          <span className="text-xs font-medium">{uploading ? 'در حال آپلود…' : 'انتخاب فایل (PDF/عکس)'}</span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        aria-label="انتخاب فایل"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        aria-label="گرفتن عکس"
      />

      {attachments.length > 0 ? (
        <div className="mt-3 space-y-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
              {a.mimeType.includes('pdf') ? (
                <FileText className="size-5 text-red-500 shrink-0" />
              ) : (
                <ImageIcon className="size-5 text-green-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{a.fileName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {ATTACHMENT_KINDS[a.kind as keyof typeof ATTACHMENT_KINDS] ?? a.kind} · {formatQty(a.size / 1024)} کیلوبایت
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(a.id)}
                className="size-9 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
                aria-label="حذف"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <SelectionSheet
        open={kindOpen}
        onOpenChange={setKindOpen}
        title="نوع مدرک"
        searchable={false}
        options={Object.entries(ATTACHMENT_KINDS).map(([key, label]) => ({ id: key, label }))}
        selected={[]}
        onConfirm={(ids) => void uploadWithKind(ids[0] ?? 'OTHER')}
      />
    </div>
  )
}

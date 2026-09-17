"use client"

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Send, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, ClientApiError, type MasterData, type StatementDetail } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, SelectionSheet } from '@/components/app/shared'
import { GM_SIGN_THRESHOLD_TOMAN } from '@/lib/permissions'
import { toFa, formatQty } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

type SheetKind = 'workshop' | 'project' | null

export default function StatementForm({ params }: { params?: Record<string, unknown> }) {
  const editId = typeof params?.id === 'string' ? params.id : null
  const back = useApp((s) => s.back)
  const navigate = useApp((s) => s.navigate)

  const [md, setMd] = useState<MasterData | null>(null)
  const [loaded, setLoaded] = useState(editId === null)
  const [title, setTitle] = useState('')
  const [periodText, setPeriodText] = useState('')
  const [amount, setAmount] = useState('')
  const [workshopId, setWorkshopId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [sheet, setSheet] = useState<SheetKind>(null)

  useEffect(() => {
    api
      .get<MasterData>('/api/v1/master')
      .then((data) => {
        setMd(data)
        if (!editId) setWorkshopId(data.workshops[0]?.id ?? '')
      })
      .catch(() => toast.error(ERROR_MSG))
  }, [editId])

  useEffect(() => {
    if (!editId) return
    api
      .get<{ statement: StatementDetail }>(`/api/v1/statements/${editId}`)
      .then(({ statement }) => {
        setTitle(statement.title)
        setPeriodText(statement.periodText ?? '')
        setAmount(String(Number(statement.amount)))
        setWorkshopId(statement.workshopId)
        setProjectId(statement.projectId ?? '')
        setDescription(statement.description ?? '')
        setLoaded(true)
      })
      .catch(() => {
        toast.error('صورت وضعیت یافت نشد.')
        back()
      })
  }, [editId, back])

  const workshopOptions = useMemo(() => (md?.workshops ?? []).map((w) => ({ id: w.id, label: w.name, hint: w.code })), [md])
  const projectOptions = useMemo(
    () => (md?.projects ?? []).filter((p) => !workshopId || p.workshopId === null || p.workshopId === workshopId).map((p) => ({ id: p.id, label: p.name, hint: p.code })),
    [md, workshopId]
  )

  const amountNum = Number(toEnDigits(amount).replace(/[,\s٬]/g, ''))
  const amountValid = Number.isFinite(amountNum) && amountNum > 0
  const needsGm = amountValid && amountNum > GM_SIGN_THRESHOLD_TOMAN

  function toEnDigits(s: string): string {
    return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  }

  function onAmountChange(v: string) {
    // نمایش با جداکنندهٔ هزارگان — ذخیرهٔ عدد خام
    const raw = toEnDigits(v).replace(/[^\d]/g, '')
    if (raw.length > 15) return
    const n = Number(raw)
    setAmount(raw === '' ? '' : n.toLocaleString('en-US'))
  }

  async function save(submitAfter: boolean) {
    if (title.trim().length < 3) {
      toast.error('عنوان صورت وضعیت را وارد کنید.')
      return
    }
    if (!workshopId) {
      toast.error('کارگاه را انتخاب کنید.')
      return
    }
    if (!amountValid) {
      toast.error('مبلغ معتبر وارد کنید.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        workshopId,
        projectId: projectId || null,
        title: title.trim(),
        periodText: periodText.trim() || null,
        amount: amountNum,
        description: description.trim() || null,
      }
      let id = editId
      if (editId) {
        await api.patch(`/api/v1/statements/${editId}`, payload)
      } else {
        const res = await api.post<{ statementId: string }>('/api/v1/statements', payload)
        id = res.statementId
      }
      if (submitAfter && id) {
        await api.post(`/api/v1/statements/${id}/submit`, {})
        toast.success('صورت وضعیت برای بررسی ارسال شد.')
      } else {
        toast.success(editId ? 'صورت وضعیت به‌روزرسانی شد.' : 'پیش‌نویس ذخیره شد.')
      }
      navigate('statement-detail', { id: id as string }, true)
    } catch (e) {
      if (e instanceof ClientApiError) toast.error(e.message)
      else toast.error('خطا در ذخیرهٔ صورت وضعیت.')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="max-w-lg mx-auto">
        <ScreenHeader title={editId ? 'ویرایش صورت وضعیت' : 'صورت وضعیت جدید'} onBack={back} />
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <ScreenHeader
        title={editId ? 'ویرایش صورت وضعیت' : 'صورت وضعیت جدید'}
        subtitle="گزارش پیشرفت کار برای تأیید و امضا"
        onBack={back}
      />

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setSheet('workshop')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
            <span className="block text-[11px] text-muted-foreground mb-1">کارگاه</span>
            <span className="block text-sm font-medium truncate">{md?.workshops.find((w) => w.id === workshopId)?.name ?? 'انتخاب کنید'}</span>
          </button>
          <button type="button" onClick={() => setSheet('project')} className="rounded-xl border border-border bg-card p-3 text-right min-h-16">
            <span className="block text-[11px] text-muted-foreground mb-1">پروژه (اختیاری)</span>
            <span className="block text-sm font-medium truncate">{md?.projects.find((p) => p.id === projectId)?.name ?? 'انتخاب کنید'}</span>
          </button>
        </div>

        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان — مثلاً صورت وضعیت اسکلت طبقهٔ دوم" className="h-12 bg-card" maxLength={200} />
        <Input value={periodText} onChange={(e) => setPeriodText(e.target.value)} placeholder="دوره (اختیاری) — مثلاً شهریور ۱۴۰۵" className="h-12 bg-card" maxLength={100} />

        <div>
          <Input
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="مبلغ به تومان — مثلاً ۱۸۰٬۰۰۰٬۰۰۰"
            className="h-12 bg-card numeric-input"
            inputMode="numeric"
          />
          {amountValid ? (
            <p className="text-[11px] text-muted-foreground mt-1.5 px-1">{toFa(formatQty(amountNum))} تومان</p>
          ) : null}
        </div>

        {needsGm ? (
          <div className="flex items-start gap-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-800 px-3 py-2.5">
            <Info className="size-4 mt-0.5 shrink-0" />
            <p className="text-xs leading-6">
              مبلغ بالای {toFa(formatQty(GM_SIGN_THRESHOLD_TOMAN))} تومان است — پس از تأیید مدیر، امضای مدیر کل لازم می‌شود.
            </p>
          </div>
        ) : null}

        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="شرح کار انجام‌شده، ردیف‌های صورت وضعیت و توضیحات…"
          className="bg-card leading-8"
          maxLength={4000}
        />

        <div className="grid grid-cols-2 gap-2.5 sticky bottom-20">
          <Button type="button" variant="outline" className="h-12" onClick={() => void save(false)} disabled={saving}>
            <Save className="size-4" />
            ذخیرهٔ پیش‌نویس
          </Button>
          <Button type="button" className="h-12 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void save(true)} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            ارسال برای بررسی
          </Button>
        </div>
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
    </div>
  )
}

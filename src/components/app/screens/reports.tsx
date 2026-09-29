"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/client'
import { ScreenHeader, ListSkeleton, ErrorState } from '@/components/app/shared'
import { ENTRY_TYPES } from '@/lib/permissions'
import { formatQty, toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'
import { ArrowLeftRight, HandCoins, Undo2, PackageCheck } from 'lucide-react'

interface SummaryData {
  totals: { entries: number; transfers: number; loans: number; returns: number }
  byType: Array<{ type: string; count: number }>
  byMaterial: Array<{ materialName: string; unit: string; totalQuantity: number; entries: number }>
  bySupplier: Array<{ name: string; count: number }>
  byProject: Array<{ name: string; count: number }>
}

export default function Reports() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api
      .get<SummaryData>('/api/v1/reports/summary')
      .then(setData)
      .catch(() => setError(true))
  }, [])

  function retry() {
    setError(false)
    api
      .get<SummaryData>('/api/v1/reports/summary')
      .then(setData)
      .catch(() => setError(true))
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="گزارش‌ها" subtitle="داده‌های محدوده دسترسی شما" />
      <div className="p-4 space-y-4">
        {error ? (
          <ErrorState message={ERROR_MSG} onRetry={retry} />
        ) : !data ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            {/* خلاصه کلی */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-zinc-900 text-white p-4">
                <PackageCheck className="size-5 text-amber-400 mb-2" />
                <p className="text-2xl font-bold numeric-input">{toFa(data.totals.entries)}</p>
                <p className="text-[11px] text-zinc-400">کل ثبت‌ها</p>
              </div>
              <div className="space-y-2.5">
                <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                  <ArrowLeftRight className="size-4 text-blue-600" />
                  <span className="text-xs flex-1">انتقال بین کارگاه‌ها</span>
                  <span className="font-bold text-sm numeric-input">{toFa(data.totals.transfers)}</span>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                  <HandCoins className="size-4 text-amber-600" />
                  <span className="text-xs flex-1">امانت‌ها</span>
                  <span className="font-bold text-sm numeric-input">{toFa(data.totals.loans)}</span>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                  <Undo2 className="size-4 text-green-600" />
                  <span className="text-xs flex-1">برگشت‌ها</span>
                  <span className="font-bold text-sm numeric-input">{toFa(data.totals.returns)}</span>
                </div>
              </div>
            </div>

            {/* بر اساس مصالح */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">مجموع مصالح ورودی</h3>
              {data.byMaterial.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">داده‌ای موجود نیست.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.byMaterial.map((m) => (
                    <div key={`${m.materialName}-${m.unit}`} className="flex items-center gap-3">
                      <span className="text-xs flex-1 truncate">{m.materialName}</span>
                      <span className="text-xs text-muted-foreground">{toFa(m.entries)} ثبت</span>
                      <span className="text-sm font-bold text-accent numeric-input whitespace-nowrap">
                        {formatQty(m.totalQuantity)} {m.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* بر اساس پروژه */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">بر اساس پروژه</h3>
              {data.byProject.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">داده‌ای موجود نیست.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.byProject.map((p) => {
                    const max = Math.max(...data.byProject.map((x) => x.count))
                    return (
                      <div key={p.name} className="flex items-center gap-3">
                        <span className="text-xs w-24 truncate">{p.name}</span>
                        <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full" style={{ width: `${(p.count / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold w-8 numeric-input">{toFa(p.count)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* بر اساس تأمین‌کننده */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">تأمین‌کنندگان</h3>
              {data.bySupplier.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">داده‌ای موجود نیست.</p>
              ) : (
                <div className="space-y-2">
                  {data.bySupplier.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="truncate">{s.name}</span>
                      <span className="font-bold numeric-input">{toFa(s.count)} ثبت</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* بر اساس نوع */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">بر اساس نوع ورود</h3>
              <div className="flex flex-wrap gap-2">
                {data.byType.map((t) => (
                  <span key={t.type} className="rounded-full bg-secondary px-3 py-1.5 text-xs">
                    {ENTRY_TYPES[t.type as keyof typeof ENTRY_TYPES] ?? t.type}: <b className="numeric-input">{toFa(t.count)}</b>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

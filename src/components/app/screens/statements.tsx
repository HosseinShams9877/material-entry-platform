"use client"

import { useCallback, useEffect, useState } from 'react'
import { api, type StatementListItem } from '@/lib/client'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState } from '@/components/app/shared'
import { formatRelative, toFa, formatQty } from '@/lib/fa'
import { STATEMENT_STATUS_STYLES } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/app'
import { ERROR_MSG } from '@/components/app/messages'
import { cn } from '@/lib/utils'

const STATUS_FILTERS = [
  { key: 'ALL', label: 'همه' },
  { key: 'SUBMITTED', label: 'در انتظار بررسی' },
  { key: 'PENDING_GM_SIGN', label: 'در انتظار امضا' },
  { key: 'APPROVED', label: 'تأیید شده' },
  { key: 'SIGNED', label: 'امضاشده' },
  { key: 'REJECTED', label: 'رد شده' },
  { key: 'DRAFT', label: 'پیش‌نویس' },
]

export function StatementStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const s = STATEMENT_STATUS_STYLES[status]
  if (!s) return null
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-medium', s.badge, size === 'sm' ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-xs')}>
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}

/** مبلغ تومان با ارقام فارسی و جداکنندهٔ هزارگان */
export function formatToman(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '—'
  return `${formatQty(n)} تومان`
}

export default function Statements() {
  const [items, setItems] = useState<StatementListItem[]>([])
  const [status, setStatus] = useState('ALL')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const navigate = useApp((s) => s.navigate)

  const load = useCallback(async (p: number, st: string) => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ statements: StatementListItem[]; pagination: { totalPages: number } }>(
        `/api/v1/statements?page=${p}&pageSize=15${st !== 'ALL' ? `&status=${st}` : ''}`
      )
      setItems(res.statements)
      setTotalPages(res.pagination.totalPages)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(page, status)
  }, [page, status, load])

  const applyFilter = (st: string) => {
    setStatus(st)
    setPage(1)
    void load(1, st)
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="صورت وضعیت‌ها" subtitle="گزارش پیشرفت کار با گردش تأیید و امضا" />
      <div className="safe-top" />

      <div className="px-4 pt-2.5 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => applyFilter(f.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium min-h-8 transition-colors ${
              status === f.key ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : error && items.length === 0 ? (
        <ErrorState message={ERROR_MSG} onRetry={() => void load(page, status)} />
      ) : items.length === 0 ? (
        <EmptyState title="صورت وضعیتی پیدا نشد" hint="با این فیلتر هیچ صورت وضعیتی ثبت نشده است." />
      ) : (
        <div className="px-4 space-y-2.5 pb-8">
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => navigate('statement-detail', { id: s.id })}
              className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <StatementStatusBadge status={s.status} />
                <span className="text-[11px] text-muted-foreground shrink-0">
                  شماره {toFa(s.number)} · {formatRelative(s.submittedAt ?? s.createdAt)}
                </span>
              </div>
              <p className="text-sm font-medium truncate">{s.title}</p>
              <div className="flex items-center justify-between mt-2 flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-bold text-foreground">{formatToman(s.amount)}</span>
                <span>
                  {s.workshopName}
                  {s.projectName ? ` · ${s.projectName}` : ''}
                  {s.periodText ? ` · ${s.periodText}` : ''}
                </span>
              </div>
            </button>
          ))}

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحه {toFa(page)} از {toFa(totalPages)}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                بعدی
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

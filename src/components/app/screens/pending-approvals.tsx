"use client"

import { useCallback, useEffect, useState } from 'react'
import { api, type EntryListItem } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, StatusBadge, TypeBadge, ListSkeleton, EmptyState, ErrorState } from '@/components/app/shared'
import { formatRelative, formatQty, toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

/** صف تأیید مدیر — فقط ثبت‌های در انتظار بررسی */
export default function PendingApprovals() {
  const [entries, setEntries] = useState<EntryListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const navigate = useApp((s) => s.navigate)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ entries: EntryListItem[] }>('/api/v1/material-entries?status=SUBMITTED&pageSize=50')
      const res2 = await api.get<{ entries: EntryListItem[] }>('/api/v1/material-entries?status=PENDING_REVIEW&pageSize=50')
      const res3 = await api.get<{ entries: EntryListItem[] }>('/api/v1/material-entries?status=RESUBMITTED&pageSize=50')
      const all = [...res.entries, ...res2.entries, ...res3.entries]
      all.sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
      setEntries(all)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="تأییدات در انتظار" subtitle="ثبت‌هایی که منتظر بررسی شما هستند" />
      <div className="p-4">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : entries.length === 0 ? (
          <EmptyState title="صف بررسی خالی است" hint="همه ثبت‌های ارسال‌شده بررسی شده‌اند." />
        ) : (
          <div className="space-y-2.5">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => navigate('entry-detail', { id: e.id })}
                className="w-full rounded-xl border border-border bg-card p-4 text-right active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <StatusBadge status={e.status} size="sm" />
                  <span className="text-[11px] text-muted-foreground">{formatRelative(e.submittedAt ?? e.createdAt)}</span>
                </div>
                <p className="text-sm font-medium truncate">
                  {e.items.length > 0 ? `${e.items[0].materialName} — ${formatQty(e.items[0].quantity)} ${e.items[0].unit}` : 'بدون قلم'}
                  {e.items.length > 1 ? ` + ${toFa(e.items.length - 1)} قلم` : ''}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-muted-foreground">
                  <TypeBadge type={e.type} />
                  <span>{e.supervisorName}</span>
                  {e.source ? <span>از {e.source}</span> : null}
                  {e.projects.map((p) => (
                    <span key={p.id}>{p.name}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

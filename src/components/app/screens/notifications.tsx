"use client"

import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { api, type NotificationItem } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState } from '@/components/app/shared'
import { formatRelative, toFa } from '@/lib/fa'
import { Button } from '@/components/ui/button'
import { ERROR_MSG } from '@/components/app/messages'
import { cn } from '@/lib/utils'

const TYPE_COLORS: Record<string, string> = {
  ENTRY_SUBMITTED: 'bg-blue-100 text-blue-700',
  ENTRY_APPROVED: 'bg-green-100 text-green-700',
  ENTRY_REJECTED: 'bg-red-100 text-red-700',
  CORRECTION_REQUESTED: 'bg-orange-100 text-orange-700',
  CORRECTION_APPROVED: 'bg-green-100 text-green-700',
  NEW_CORRECTION_REQUEST: 'bg-orange-100 text-orange-700',
  // وظایف و گزارش‌های روزانه
  TASK_SENT: 'bg-blue-100 text-blue-700',
  TASK_UPDATED: 'bg-amber-100 text-amber-800',
  TASK_ITEM_COMPLETED: 'bg-teal-100 text-teal-700',
  TASK_COMPLETED: 'bg-green-100 text-green-700',
  TASK_CANCELLED: 'bg-red-100 text-red-700',
  TASK_DUE_SOON: 'bg-orange-100 text-orange-700',
  TASK_OVERDUE: 'bg-red-100 text-red-700',
  REPORT_SUBMITTED: 'bg-blue-100 text-blue-700',
  REPORT_REVIEWED: 'bg-green-100 text-green-700',
  // انبار
  STOCK_DISCREPANCY: 'bg-orange-100 text-orange-700',
  PURCHASE_STALE: 'bg-red-100 text-red-700',
  ENTRY_STAGE: 'bg-cyan-100 text-cyan-700',
  ENTRY_TECH_REVIEWED: 'bg-violet-100 text-violet-700',
  ENTRY_CLOSED: 'bg-zinc-200 text-zinc-700',
}

/** مقصد کلیک روی اعلان — مدیر باید بتواند مستقیم نتیجهٔ کامل را ببیند */
function notificationTarget(entityType: string | null): { screen: 'entry-detail' | 'daily-task-detail' | 'daily-report-detail'; param: string } | null {
  switch (entityType) {
    case 'MaterialEntry':
      return { screen: 'entry-detail', param: 'id' }
    case 'DailyTask':
      return { screen: 'daily-task-detail', param: 'id' }
    case 'DailyReport':
      return { screen: 'daily-report-detail', param: 'id' }
    default:
      return null
  }
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const navigate = useApp((s) => s.navigate)
  const setUnreadCount = useApp((s) => s.setUnreadCount)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ notifications: NotificationItem[]; unreadCount: number }>('/api/v1/notifications')
      setItems(res.notifications)
      setUnreadCount(res.unreadCount)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
     
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function markAllRead() {
    await api.post('/api/v1/notifications').catch(() => undefined)
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="اعلان‌ها"
        right={
          <Button variant="ghost" size="sm" className="text-xs h-9 gap-1" onClick={() => void markAllRead()}>
            <CheckCheck className="size-4" />
            خواندن همه
          </Button>
        }
      />
      <div className="p-4">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title="هنوز اعلانی ندارید" hint="اعلان‌های تأیید، رد و اصلاح اینجا نمایش داده می‌شوند." icon={<Bell className="size-7" />} />
        ) : (
          <div className="space-y-2">
            {items.map((n) => {
              const target = notificationTarget(n.entityType)
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (n.entityId && target) {
                      navigate(target.screen, { [target.param]: n.entityId })
                    } else if (n.entityType === 'StockDiscrepancy') {
                      navigate('inventory')
                    }
                  }}
                  className={cn(
                    'w-full rounded-xl border p-3.5 text-right transition-colors',
                    n.isRead ? 'border-border bg-card' : 'border-accent/40 bg-accent/5',
                    (target || n.entityType === 'StockDiscrepancy') ? 'active:scale-[0.99]' : ''
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium', TYPE_COLORS[n.type] ?? 'bg-secondary text-secondary-foreground')}>
                      {n.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground mr-auto">{formatRelative(n.createdAt)}</span>
                    {!n.isRead ? <span className="size-2 rounded-full bg-accent" /> : null}
                  </div>
                  <p className="text-xs leading-6 text-muted-foreground">{n.body}</p>
                  {target || n.entityType === 'StockDiscrepancy' ? (
                    <span className="text-[10px] text-accent font-medium mt-1 inline-flex items-center gap-1">مشاهدهٔ جزئیات کامل ←</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
        {!loading && items.length > 0 ? (
          <p className="text-center text-[10px] text-muted-foreground mt-4">{toFa(items.length)} اعلان اخیر</p>
        ) : null}
      </div>
    </div>
  )
}

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
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => n.entityId && n.entityType === 'MaterialEntry' && navigate('entry-detail', { id: n.entityId })}
                className={cn(
                  'w-full rounded-xl border p-3.5 text-right transition-colors',
                  n.isRead ? 'border-border bg-card' : 'border-accent/40 bg-accent/5'
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
              </button>
            ))}
          </div>
        )}
        {!loading && items.length > 0 ? (
          <p className="text-center text-[10px] text-muted-foreground mt-4">{toFa(items.length)} اعلان اخیر</p>
        ) : null}
      </div>
    </div>
  )
}

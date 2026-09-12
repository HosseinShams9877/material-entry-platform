"use client"

import { useCallback, useEffect, useState } from 'react'
import { api, type AuditLogItem } from '@/lib/client'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState } from '@/components/app/shared'
import { formatJalaliDateTime } from '@/lib/fa'
import { Button } from '@/components/ui/button'
import { ERROR_MSG } from '@/components/app/messages'
import { ROLES } from '@/lib/permissions'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CREATE: { label: 'ایجاد', color: 'bg-blue-100 text-blue-700' },
  EDIT: { label: 'ویرایش', color: 'bg-yellow-100 text-yellow-800' },
  SUBMIT: { label: 'ارسال', color: 'bg-blue-100 text-blue-700' },
  APPROVE: { label: 'تأیید', color: 'bg-green-100 text-green-700' },
  REJECT: { label: 'رد', color: 'bg-red-100 text-red-700' },
  REQUEST_CORRECTION: { label: 'درخواست اصلاح', color: 'bg-orange-100 text-orange-700' },
  APPROVE_CORRECTION: { label: 'تأیید اصلاح', color: 'bg-green-100 text-green-700' },
  REJECT_CORRECTION: { label: 'رد اصلاح', color: 'bg-red-100 text-red-700' },
  LOCK: { label: 'قفل', color: 'bg-zinc-200 text-zinc-700' },
  UPLOAD_ATTACHMENT: { label: 'پیوست مدرک', color: 'bg-purple-100 text-purple-700' },
  DELETE_ATTACHMENT: { label: 'حذف مدرک', color: 'bg-red-100 text-red-700' },
  LOGIN: { label: 'ورود', color: 'bg-teal-100 text-teal-700' },
  LOGIN_FAILED: { label: 'ورود ناموفق', color: 'bg-red-100 text-red-700' },
  LOGOUT: { label: 'خروج', color: 'bg-zinc-200 text-zinc-700' },
  PERMISSION_CHANGE: { label: 'تغییر دسترسی', color: 'bg-orange-100 text-orange-700' },
  VOICE_PROCESS: { label: 'پردازش صوتی', color: 'bg-purple-100 text-purple-700' },
  RESUBMIT: { label: 'ارسال مجدد', color: 'bg-blue-100 text-blue-700' },
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ logs: AuditLogItem[]; pagination: { totalPages: number } }>(`/api/v1/audit-logs?page=${p}&pageSize=25`)
      setLogs(res.logs)
      setTotalPages(res.pagination.totalPages)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [page, load])

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="حسابرسی" subtitle="تمام عملیات مهم ثبت می‌شود — فقط خواندنی" />
      <div className="p-4">
        {loading && logs.length === 0 ? (
          <ListSkeleton rows={6} />
        ) : error && logs.length === 0 ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load(page)} />
        ) : logs.length === 0 ? (
          <EmptyState title="لاگی ثبت نشده است" />
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-secondary' }
              const isOpen = expanded === log.id
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                  className="w-full rounded-xl border border-border bg-card p-3.5 text-right"
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${meta.color}`}>{meta.label}</span>
                    <span className="text-[11px] font-medium">{log.entityType}</span>
                    <span className="text-[10px] text-muted-foreground mr-auto">{formatJalaliDateTime(log.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {log.user ? `${log.user.fullName} (${ROLES[log.user.role as keyof typeof ROLES] ?? log.user.role})` : 'سیستم'}
                    {log.ip ? ` · IP: ${log.ip}` : ''}
                  </p>
                  {log.reason ? <p className="text-xs mt-1">دلیل: {log.reason}</p> : null}
                  {isOpen && (log.oldValue || log.newValue) ? (
                    <div className="mt-2 space-y-1.5">
                      {log.oldValue ? (
                        <pre dir="ltr" className="text-[10px] bg-secondary rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                          {log.oldValue}
                        </pre>
                      ) : null}
                      {log.newValue ? (
                        <pre dir="ltr" className="text-[10px] bg-accent/5 border border-accent/20 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                          {log.newValue}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              )
            })}
            {totalPages > 1 ? (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  قبلی
                </Button>
                <span className="text-xs text-muted-foreground">
                  صفحه {page} از {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  بعدی
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

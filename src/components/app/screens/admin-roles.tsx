"use client"

import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { api } from '@/lib/client'
import { ScreenHeader, ListSkeleton, ErrorState } from '@/components/app/shared'
import { ROLES } from '@/lib/permissions'
import { ERROR_MSG } from '@/components/app/messages'
import { cn } from '@/lib/utils'

interface RolesData {
  codeMatrix: Record<string, readonly string[]>
  roles: Record<string, string>
  permissions: Record<string, string>
}

/** ماتریس نقش/دسترسی — نمای شفاف RBAC */
export default function AdminRoles() {
  const [data, setData] = useState<RolesData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api
      .get<RolesData>('/api/v1/admin/roles')
      .then(setData)
      .catch(() => setError(true))
  }, [])

  function retry() {
    setError(false)
    api
      .get<RolesData>('/api/v1/admin/roles')
      .then(setData)
      .catch(() => setError(true))
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="نقش‌ها و دسترسی‌ها" subtitle="ماتریس کنترل دسترسی مبتنی بر نقش" />
      <div className="p-4">
        {error ? (
          <ErrorState message={ERROR_MSG} onRetry={retry} />
        ) : !data ? (
          <ListSkeleton rows={5} />
        ) : (
          <>
            <div className="rounded-xl bg-secondary/70 border border-border p-3.5 mb-4">
              <p className="text-xs leading-6 text-muted-foreground">
                نقش و دسترسی از هم تفکیک شده‌اند و در سرور اعمال می‌شوند. تغییر نقش کاربر، دسترسی‌های او را به‌صورت خودکار محدود/گسترش می‌دهد.
              </p>
            </div>

            {/* ماتریس */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs min-w-[560px]">
                  <thead>
                    <tr className="bg-secondary/60">
                      <th className="px-3 py-2.5 font-semibold sticky right-0 bg-secondary/60">دسترسی</th>
                      {Object.entries(data.roles).map(([key, label]) => (
                        <th key={key} className="px-2 py-2.5 font-semibold text-center text-[10px] leading-4 min-w-16">
                          {label.split(' (')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.permissions).map(([permKey, permLabel]) => (
                      <tr key={permKey} className="border-t border-border">
                        <td className="px-3 py-2.5 sticky right-0 bg-card">
                          <span className="block font-medium">{permLabel}</span>
                          <span dir="ltr" className="block text-[9px] text-muted-foreground text-right">
                            {permKey}
                          </span>
                        </td>
                        {Object.keys(data.roles).map((roleKey) => {
                          const has = (data.codeMatrix[roleKey] ?? []).includes(permKey)
                          return (
                            <td key={roleKey} className="px-2 py-2.5 text-center">
                              <span
                                className={cn(
                                  'inline-flex items-center justify-center size-6 rounded-full',
                                  has ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-400'
                                )}
                              >
                                {has ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* توضیح نقش‌ها */}
            <div className="mt-4 space-y-2">
              {Object.entries(ROLES).map(([key, label]) => (
                <div key={key} className="rounded-xl border border-border bg-card p-3.5">
                  <p className="text-sm font-medium">{label}</p>
                  <p dir="ltr" className="text-[10px] text-muted-foreground text-right">{key}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

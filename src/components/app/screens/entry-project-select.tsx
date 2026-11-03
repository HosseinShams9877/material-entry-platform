"use client"

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, FolderKanban, ChevronLeft } from 'lucide-react'
import { api, type MasterData } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader, ListSkeleton, ErrorState, EmptyState } from '@/components/app/shared'
import { ENTRY_DIRECTIONS, type EntryDirectionKey } from '@/lib/permissions'
import { ERROR_MSG } from '@/components/app/messages'

/** گاز اول جریان یکپارچهٔ ثبت ورود/خروج:
 *  ابتدا جهت و پروژه انتخاب می‌شود و سپس کاربر مستقیم وارد همان فرم
 *  یک‌صفحه‌ای ثبت می‌شود که ناظر امروز از آن استفاده می‌کند (manual-entry).
 *  مصالح باید به انبار کارگاه پروژهٔ انتخاب‌شده تعلق داشته باشند —
 *  بدون پروژهٔ فعال اجازهٔ ثبت داده نمی‌شود. */
export default function EntryProjectSelect({ params }: { params?: Record<string, unknown> }) {
  const navigate = useApp((s) => s.navigate)
  const back = useApp((s) => s.back)
  const role = useApp((s) => s.session?.user.role)
  const session = useApp((s) => s.session)
  const [direction, setDirection] = useState<EntryDirectionKey>(
    (params?.direction as EntryDirectionKey) ?? 'IN'
  )
  const [master, setMaster] = useState<MasterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  function resetHome(r: string) {
    if (r === 'FIELD_WORKER') navigate('worker-home', undefined, true)
    else if (r === 'PROJECT_MANAGER') navigate('manager-dashboard', undefined, true)
    else if (r === 'WAREHOUSE_KEEPER') navigate('warehouse-home', undefined, true)
    else navigate('supervisor-home', undefined, true)
  }

  useEffect(() => {
    if (role && !['SITE_SUPERVISOR', 'PROJECT_MANAGER', 'WAREHOUSE_KEEPER'].includes(role)) {
      resetHome(role)
    }
  }, [role])

  useEffect(() => {
    api
      .get<MasterData>('/api/v1/master')
      .then(setMaster)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  // پروژه‌های قابل‌مشاهده توسط کاربر — اسکوپ نشست
  const projects = useMemo(() => {
    if (!master) return []
    const scopeProjectIds = session?.scope.projectIds
    if (session?.scope.isGlobal || !scopeProjectIds) return master.projects
    return master.projects.filter((p) => scopeProjectIds.includes(p.id))
  }, [master, session])

  const workshopName = (workshopId: string | null) =>
    master?.workshops.find((w) => w.id === workshopId)?.name ?? null

  const pick = (projectId: string) => {
    const p = projects.find((x) => x.id === projectId)
    if (!p) return
    // ورود مستقیم به همان فرم یک‌صفحه‌ای ثبت که ناظر استفاده می‌کند (manual-entry / EntryDraftForm) —
    // پروژه قفل‌شده است و انتخاب مصالح در همان صفحه انجام می‌شود.
    navigate('manual-entry', { direction, projectId: p.id, projectName: p.name })
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh flex flex-col">
      <ScreenHeader
        title={direction === 'OUT' ? 'ثبت خروج مصالح' : 'ثبت ورود مصالح'}
        subtitle="ابتدا پروژه را انتخاب کنید"
        onBack={back}
      />
      <div className="p-4 space-y-4">
        {/* جهت ثبت — ورود / خروج (نیازمند ۵: جریان خروج مشابه ورود) */}
        <section className="rounded-2xl border border-border bg-card/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center size-7 rounded-lg bg-secondary text-muted-foreground">
              <ArrowLeftRight className="size-4" />
            </span>
            <h3 className="text-sm font-semibold">جهت ثبت<span className="text-red-500"> *</span></h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ENTRY_DIRECTIONS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDirection(key as EntryDirectionKey)}
                className={`rounded-xl border px-3 py-3 text-sm font-medium min-h-11 transition-colors ${
                  direction === key ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* انتخاب پروژه — بدون پروژهٔ فعال ثبت ممکن نیست (نیازمند ۴) */}
        <section className="rounded-2xl border border-border bg-card/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center size-7 rounded-lg bg-secondary text-muted-foreground">
              <FolderKanban className="size-4" />
            </span>
            <h3 className="text-sm font-semibold">پروژه<span className="text-red-500"> *</span></h3>
            <span className="text-[11px] text-muted-foreground mr-auto">انبار کارگاه پروژه</span>
          </div>

          {loading ? (
            <ListSkeleton rows={4} />
          ) : error ? (
            <ErrorState message={ERROR_MSG} onRetry={() => location.reload()} />
          ) : projects.length === 0 ? (
            <EmptyState title="پروژه‌ای موجود نیست" hint="ابتدا یک پروژهٔ فعال ایجاد کنید تا بتوانید ثبت کنید." />
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p.id)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3.5 min-h-14 flex items-center gap-3 text-right active:scale-[0.99] transition-transform"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{p.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {p.code ? `کد ${p.code}` : ''}
                      {workshopName(p.workshopId) ? ` — انبار ${workshopName(p.workshopId)}` : ''}
                    </span>
                  </span>
                  <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="p-4 mt-auto">
        <p className="text-center text-xs text-muted-foreground">
          مصالح واردشده به انبار کارگاه همین پروژه ثبت می‌شود.
        </p>
      </div>
    </div>
  )
}

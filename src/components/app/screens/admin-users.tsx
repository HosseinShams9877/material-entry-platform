"use client"

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Power, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ClientApiError } from '@/lib/client'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, SelectionSheet } from '@/components/app/shared'
import { ROLES } from '@/lib/permissions'
import { toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

interface AdminUser {
  id: string
  username: string
  fullName: string
  role: string
  phone: string | null
  isActive: boolean
  workshop: { id: string; name: string } | null
  workshops: Array<{ id: string; name: string }>
  projects: Array<{ id: string; name: string }>
  workerId: string | null
  linkedWorker: { id: string; fullName: string } | null
}

interface WorkerRef {
  id: string
  fullName: string
  kind: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [workshops, setWorkshops] = useState<Array<{ id: string; name: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string; workshopId: string | null }>>([])
  const [workers, setWorkers] = useState<WorkerRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<null | {
    id?: string
    username: string
    password: string
    fullName: string
    role: string
    phone: string
    workshopId: string | null
    workshopAccessIds: string[]
    projectIds: string[]
    workerId: string | null
    isActive: boolean
  }>(null)
  const [wsOpen, setWsOpen] = useState(false)
  const [prjOpen, setPrjOpen] = useState(false)
  const [workerOpen, setWorkerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [u, w, p, wk] = await Promise.all([
        api.get<{ users: AdminUser[] }>('/api/v1/admin/users'),
        api.get<{ workshops: Array<{ id: string; name: string }> }>('/api/v1/admin/workshops'),
        api.get<{ projects: Array<{ id: string; name: string; workshopId: string | null }> }>('/api/v1/admin/projects'),
        api.get<{ workers: WorkerRef[] }>('/api/v1/admin/workers').catch(() => ({ workers: [] as WorkerRef[] })),
      ])
      setUsers(u.users)
      setWorkshops(w.workshops)
      setProjects(p.projects)
      setWorkers(wk.workers)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!form) return
    setSaving(true)
    try {
      if (form.id) {
        await api.patch(`/api/v1/admin/users/${form.id}`, {
          fullName: form.fullName,
          role: form.role,
          phone: form.phone || null,
          workshopId: form.workshopId,
          workshopAccessIds: form.workshopAccessIds,
          projectIds: form.projectIds,
          workerId: form.role === 'FIELD_WORKER' ? form.workerId : null,
          isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
        })
        toast.success('کاربر ویرایش شد.')
      } else {
        await api.post('/api/v1/admin/users', {
          username: form.username,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          phone: form.phone || null,
          workshopId: form.workshopId,
          workshopAccessIds: form.workshopAccessIds,
          projectIds: form.projectIds,
          workerId: form.role === 'FIELD_WORKER' ? form.workerId : null,
        })
        toast.success('کاربر ایجاد شد.')
      }
      setForm(null)
      await load()
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    } finally {
      setSaving(false)
    }
  }

  const filtered = query.trim()
    ? users.filter((u) => u.fullName.includes(query.trim()) || u.username.includes(query.trim()))
    : users

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="مدیریت کاربران"
        right={
          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={() =>
              setForm({ username: '', password: '', fullName: '', role: 'WORKSHOP_SUPERVISOR', phone: '', workshopId: null, workshopAccessIds: [], projectIds: [], workerId: null, isActive: true })
            }
          >
            <Plus className="size-4" />
            کاربر
          </Button>
        }
      />
      <div className="p-4">
        <div className="relative mb-3">
          <Search className="size-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی کاربر…"
            className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 text-sm outline-none"
          />
        </div>

        {loading && users.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : error && users.length === 0 ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="کاربری پیدا نشد" />
        ) : (
          <div className="space-y-2">
            {filtered.map((u) => (
              <div key={u.id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-secondary flex items-center justify-center font-bold text-sm shrink-0">
                    {u.fullName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {u.fullName}
                      {!u.isActive ? <span className="text-[10px] bg-zinc-100 text-zinc-500 rounded-md px-1.5 py-0.5 mr-1.5">غیرفعال</span> : null}
                    </p>
                    <p dir="ltr" className="text-[11px] text-muted-foreground text-right">
                      {u.username} · {ROLES[u.role as keyof typeof ROLES] ?? u.role}
                      {u.linkedWorker ? ` · ${u.linkedWorker.fullName}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        id: u.id,
                        username: u.username,
                        password: '',
                        fullName: u.fullName,
                        role: u.role,
                        phone: u.phone ?? '',
                        workshopId: u.workshop?.id ?? null,
                        workshopAccessIds: u.workshops.map((w) => w.id),
                        projectIds: u.projects.map((p) => p.id),
                        workerId: u.workerId,
                        isActive: u.isActive,
                      })
                    }
                    className="size-10 rounded-lg flex items-center justify-center text-accent hover:bg-secondary shrink-0"
                    aria-label="ویرایش"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.patch(`/api/v1/admin/users/${u.id}`, { isActive: !u.isActive }).catch(() => undefined)
                      await load()
                    }}
                    className="size-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary shrink-0"
                    aria-label="فعال/غیرفعال"
                  >
                    <Power className="size-4" />
                  </button>
                </div>
                {u.projects.length > 0 || u.workshops.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {u.workshops.map((w) => (
                      <span key={w.id} className="text-[10px] bg-secondary rounded-md px-1.5 py-0.5">
                        {w.name}
                      </span>
                    ))}
                    {u.projects.map((p) => (
                      <span key={p.id} className="text-[10px] bg-accent/10 text-accent rounded-md px-1.5 py-0.5">
                        {p.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <p className="text-center text-[10px] text-muted-foreground pt-2">{toFa(users.length)} کاربر</p>
          </div>
        )}
      </div>

      {/* فرم کاربر */}
      {form ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setForm(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-4">{form.id ? 'ویرایش کاربر' : 'کاربر جدید'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">نام و نام خانوادگی <span className="text-red-500">*</span></label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="bg-secondary/60 border-0" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">نام کاربری <span className="text-red-500">*</span></label>
                <Input
                  dir="ltr"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  disabled={!!form.id}
                  className="bg-secondary/60 border-0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  گذرواژه {form.id ? <span className="text-muted-foreground">(خالی = بدون تغییر)</span> : <span className="text-red-500">*</span>}
                </label>
                <Input dir="ltr" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-secondary/60 border-0" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">نقش <span className="text-red-500">*</span></label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm min-h-11"
                >
                  {Object.entries(ROLES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">کارگاه اصلی (برای سرپرست / نیروی اجرایی)</label>
                <button type="button" onClick={() => setWsOpen(true)} className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11">
                  {form.workshopId ? workshops.find((w) => w.id === form.workshopId)?.name ?? '—' : 'انتخاب کارگاه…'}
                </button>
              </div>
              {form.role === 'FIELD_WORKER' ? (
                <div>
                  <label className="block text-xs font-medium mb-1.5">
                    اتصال به پروفایل کارگر <span className="text-red-500">*</span>
                  </label>
                  <button type="button" onClick={() => setWorkerOpen(true)} className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11">
                    {form.workerId ? workers.find((w) => w.id === form.workerId)?.fullName ?? '—' : 'انتخاب کارگر…'}
                  </button>
                  <p className="text-[10px] text-muted-foreground mt-1">نیروی اجرایی گزارش کارش را به نام همین کارگر ثبت می‌کند.</p>
                </div>
              ) : null}
              <div>
                <label className="block text-xs font-medium mb-1.5">دسترسی کارگاه‌ها</label>
                <button
                  type="button"
                  onClick={() => setWsOpen(true)}
                  className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11 text-muted-foreground"
                >
                  {form.workshopAccessIds.length ? `${toFa(form.workshopAccessIds.length)} کارگاه انتخاب شده` : 'انتخاب…'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">پروژه‌های دسترسی‌دار (برای مدیر پروژه)</label>
                <button
                  type="button"
                  onClick={() => setPrjOpen(true)}
                  className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11 text-muted-foreground"
                >
                  {form.projectIds.length ? `${toFa(form.projectIds.length)} پروژه انتخاب شده` : 'انتخاب…'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">حساب فعال</span>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-5 accent-amber-600" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-5">
              <Button variant="outline" onClick={() => setForm(null)} className="h-12 rounded-xl">
                انصراف
              </Button>
              <Button onClick={() => void save()} disabled={saving} className="h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
                {saving ? 'در حال ذخیره…' : 'ذخیره'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <SelectionSheet
        open={wsOpen}
        onOpenChange={setWsOpen}
        title="انتخاب کارگاه"
        options={workshops.map((w) => ({ id: w.id, label: w.name }))}
        selected={form?.id ? form.workshopAccessIds : form?.workshopAccessIds ?? []}
        multi
        onConfirm={(ids) => form && setForm({ ...form, workshopAccessIds: ids, workshopId: form.workshopId ?? ids[0] ?? null })}
      />
      <SelectionSheet
        open={prjOpen}
        onOpenChange={setPrjOpen}
        title="انتخاب پروژه‌ها"
        options={projects.map((p) => ({ id: p.id, label: p.name }))}
        selected={form?.projectIds ?? []}
        multi
        onConfirm={(ids) => form && setForm({ ...form, projectIds: ids })}
      />
      <SelectionSheet
        open={workerOpen}
        onOpenChange={setWorkerOpen}
        title="انتخاب کارگر"
        options={workers.map((w) => ({ id: w.id, label: w.fullName }))}
        selected={form?.workerId ? [form.workerId] : []}
        onConfirm={(ids) => form && setForm({ ...form, workerId: ids[0] ?? null })}
      />
    </div>
  )
}

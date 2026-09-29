"use client"

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Power, Search, ListChecks, Loader2, CheckCircle2, Circle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { api, ClientApiError, type ChecklistItemData } from '@/lib/client'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, SelectionSheet } from '@/components/app/shared'
import { useApp } from '@/store/app'
import { toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'
import { Drawer } from 'vaul'

// ─────────────────────────── پروژه‌ها — با چک‌لیست شروع پروژه و فرآیندهای کلیدی ───────────────────────────

interface Project {
  id: string
  name: string
  code: string
  clientName: string | null
  workshopId: string | null
  isActive: boolean
}

export default function AdminProjects() {
  const back = useApp((s) => s.back)

  const [items, setItems] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [workshops, setWorkshops] = useState<Array<{ id: string; name: string }>>([])

  // چک‌لیست
  const [checklistFor, setChecklistFor] = useState<Project | null>(null)
  const [checklist, setChecklist] = useState<ChecklistItemData[] | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [canTick, setCanTick] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ projects: Project[] }>('/api/v1/admin/projects')
      setItems(res.projects)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    api
      .get<{ workshops: Array<{ id: string; name: string }> }>('/api/v1/admin/workshops')
      .then((r) => setWorkshops(r.workshops))
      .catch(() => undefined)
    api
      .get<{ permissions: string[] }>('/api/v1/auth/me')
      .then((r) => setCanTick((r.permissions ?? []).includes('checklist.update')))
      .catch(() => undefined)
  }, [load])

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      if (editing === 'new') {
        await api.post('/api/v1/admin/projects', values)
        toast.success('پروژه ایجاد شد.')
      } else if (editing) {
        await api.patch(`/api/v1/admin/projects/${editing.id}`, values)
        toast.success('پروژه ویرایش شد.')
      }
      setEditing(null)
      await load()
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: Project) {
    try {
      await api.patch(`/api/v1/admin/projects/${item.id}`, { isActive: !item.isActive })
      await load()
      toast.success('وضعیت تغییر کرد.')
    } catch {
      toast.error(ERROR_MSG)
    }
  }

  async function openChecklist(project: Project) {
    setChecklistFor(project)
    setChecklist(null)
    setChecklistLoading(true)
    try {
      const res = await api.get<{ items: ChecklistItemData[] }>(`/api/v1/admin/projects/${project.id}/checklist`)
      setChecklist(res.items)
    } catch {
      toast.error(ERROR_MSG)
      setChecklist([])
    } finally {
      setChecklistLoading(false)
    }
  }

  async function tickItem(item: ChecklistItemData) {
    if (!canTick || !checklistFor) return
    try {
      await api.patch(`/api/v1/admin/projects/${checklistFor.id}/checklist/${item.id}`, { isDone: !item.isDone })
      setChecklist((prev) => (prev ?? []).map((i) => (i.id === item.id ? { ...i, isDone: !item.isDone } : i)))
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    }
  }

  async function removeItem(item: ChecklistItemData) {
    if (!checklistFor) return
    try {
      await api.del(`/api/v1/admin/projects/${checklistFor.id}/checklist/${item.id}`)
      setChecklist((prev) => (prev ?? []).filter((i) => i.id !== item.id))
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    }
  }

  async function addItem() {
    const title = newItemTitle.trim()
    if (title.length < 2 || !checklistFor) return
    try {
      const created = await api.post<ChecklistItemData>(`/api/v1/admin/projects/${checklistFor.id}/checklist`, { title })
      setChecklist((prev) => [...(prev ?? []), created])
      setNewItemTitle('')
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    }
  }

  const filtered = query.trim()
    ? items.filter((it) => it.name.includes(query.trim()) || it.code.includes(query.trim()) || (it.clientName ?? '').includes(query.trim()))
    : items

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="پروژه‌ها"
        onBack={back}
        right={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            جدید
          </Button>
        }
      />

      <div className="p-4">
        <div className="relative mb-3">
          <Search className="size-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی پروژه…"
            className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 text-sm outline-none"
          />
        </div>

        {loading && items.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : error && items.length === 0 ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="پروژه‌ای ثبت نشده است" hint="با دکمه «جدید» اولین پروژه را اضافه کنید." />
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {item.code}
                      {item.clientName ? ` · کارفرما: ${item.clientName}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openChecklist(item)}
                    className="size-10 rounded-lg flex items-center justify-center text-accent hover:bg-secondary shrink-0"
                    aria-label="چک‌لیست"
                  >
                    <ListChecks className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="size-10 rounded-lg flex items-center justify-center text-accent hover:bg-secondary shrink-0"
                    aria-label="ویرایش"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(item)}
                    className="size-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary shrink-0"
                    aria-label="فعال/غیرفعال"
                  >
                    <Power className="size-4" />
                  </button>
                </div>
              </div>
            ))}
            <p className="text-center text-[10px] text-muted-foreground pt-2">{toFa(items.length)} پروژه</p>
          </div>
        )}
      </div>

      {/* فرم ایجاد/ویرایش */}
      {editing ? (
        <ProjectForm
          project={editing === 'new' ? null : editing}
          workshops={workshops}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}

      {/* شیت چک‌لیست */}
      <Drawer.Root open={checklistFor !== null} onOpenChange={(v) => !v && setChecklistFor(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none max-h-[88dvh] flex flex-col">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <div className="px-5 pt-3 pb-2">
              <Drawer.Title className="font-semibold">چک‌لیست — {checklistFor?.name}</Drawer.Title>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                چک‌لیست شروع پروژه و فرآیندهای کلیدی — برای جلوگیری از فراموشی و دوباره‌کاری
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
              {checklistLoading ? (
                <div className="flex justify-center py-10 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : checklist && checklist.length > 0 ? (
                <div className="space-y-1.5">
                  {checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => void tickItem(item)}
                        className="shrink-0"
                        aria-label={item.isDone ? 'برداشتن تیک' : 'تیک زدن'}
                        disabled={!canTick}
                      >
                        {item.isDone ? (
                          <CheckCircle2 className="size-5 text-green-600" />
                        ) : (
                          <Circle className={canTick ? 'size-5 text-zinc-400' : 'size-5 text-zinc-300'} />
                        )}
                      </button>
                      <span className={`flex-1 text-sm leading-6 ${item.isDone ? 'text-muted-foreground line-through' : ''}`}>{item.title}</span>
                      {canTick ? (
                        <button type="button" onClick={() => void removeItem(item)} className="text-red-400 p-1 shrink-0" aria-label="حذف آیتم">
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">آیتمی نیست.</p>
              )}
            </div>
            {canTick ? (
              <div className="safe-top px-5 pb-4 pt-2 border-t border-border flex gap-2">
                <Input
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="آیتم جدید…"
                  className="h-11 bg-secondary/60"
                  maxLength={200}
                  onKeyDown={(e) => e.key === 'Enter' && void addItem()}
                />
                <Button className="h-11 shrink-0" onClick={() => void addItem()}>
                  <Plus className="size-4" />
                </Button>
              </div>
            ) : null}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}

// ─────────────────────────── فرم ایجاد/ویرایش پروژه ───────────────────────────

function ProjectForm({
  project,
  workshops,
  saving,
  onClose,
  onSave,
}: {
  project: Project | null
  workshops: Array<{ id: string; name: string }>
  saving: boolean
  onClose: () => void
  onSave: (values: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(project?.name ?? '')
  const [code, setCode] = useState(project?.code ?? '')
  const [clientName, setClientName] = useState(project?.clientName ?? '')
  const [workshopId, setWorkshopId] = useState<string | null>(project?.workshopId ?? null)
  const [isActive, setIsActive] = useState(project?.isActive ?? true)
  const [wsOpen, setWsOpen] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-4">{project ? 'ویرایش پروژه' : 'پروژه جدید'}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1.5">نام پروژه <span className="text-red-500">*</span></label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary/60 border-0" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">کد پروژه <span className="text-red-500">*</span></label>
            <Input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} className="bg-secondary/60 border-0 text-right" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">کارفرما</label>
            <Input value={clientName ?? ''} onChange={(e) => setClientName(e.target.value)} className="bg-secondary/60 border-0" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">کارگاه مرتبط</label>
            <button type="button" onClick={() => setWsOpen(true)} className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11">
              {workshopId ? workshops.find((w) => w.id === workshopId)?.name ?? '—' : 'انتخاب کارگاه…'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">فعال</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-5">
          <Button variant="outline" onClick={onClose} className="h-12 rounded-xl">
            انصراف
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: name.trim(),
                code: code.trim(),
                clientName: clientName.trim() || null,
                workshopId: workshopId ?? null,
                isActive,
              })
            }
            disabled={saving}
            className="h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </div>
      </div>

      <SelectionSheet
        open={wsOpen}
        onOpenChange={setWsOpen}
        title="انتخاب کارگاه"
        options={workshops.map((w) => ({ id: w.id, label: w.name }))}
        selected={workshopId ? [workshopId] : []}
        onConfirm={(ids) => setWorkshopId(ids[0] ?? null)}
      />
    </div>
  )
}

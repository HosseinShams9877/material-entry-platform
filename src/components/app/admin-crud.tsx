"use client"

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Power, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { api, ClientApiError } from '@/lib/client'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, SelectionSheet } from '@/components/app/shared'
import { useApp } from '@/store/app'
import { toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'
import { Drawer } from 'vaul'

// ─────────────────────────── چارچوب عمومی CRUD ادمین ───────────────────────────

export interface CrudField {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'switch' | 'workshop'
  required?: boolean
  options?: Array<{ value: string; label: string }>
  placeholder?: string
}

export interface CrudConfig<T extends { id: string }> {
  screenTitle: string
  entityFa: string
  endpoint: string
  searchKey?: string
  fields: CrudField[]
  renderPrimary: (item: T) => string
  renderSecondary?: (item: T) => string | undefined
  defaultValues: () => Record<string, unknown>
}

export function AdminCrud<T extends { id: string }>({ config }: { config: CrudConfig<T> }) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<T | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [workshops, setWorkshops] = useState<Array<{ id: string; name: string }>>([])
  const back = useApp((s) => s.back)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ [key: string]: T[] }>(config.endpoint)
      setItems(res[Object.keys(res)[0]] as T[])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
     
  }, [config.endpoint])

  useEffect(() => {
    void load()
    api
      .get<{ workshops: Array<{ id: string; name: string }> }>('/api/v1/admin/workshops')
      .then((r) => setWorkshops(r.workshops))
      .catch(() => undefined)
  }, [load])

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      if (editing === 'new') {
        await api.post(config.endpoint, values)
        toast.success(`${config.entityFa} ایجاد شد.`)
      } else if (editing) {
        await api.patch(`${config.endpoint}/${(editing as T).id}`, values)
        toast.success(`${config.entityFa} ویرایش شد.`)
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

  async function toggleActive(item: T) {
    try {
      await api.patch(`${config.endpoint}/${item.id}`, { isActive: !(item as unknown as { isActive?: boolean }).isActive })
      await load()
      toast.success('وضعیت تغییر کرد.')
    } catch {
      toast.error(ERROR_MSG)
    }
  }

  const filtered = query.trim()
    ? items.filter((it) =>
        (config.renderPrimary(it) as string).includes(query.trim()) ||
        (config.renderSecondary?.(it) ?? '').includes(query.trim())
      )
    : items

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title={config.screenTitle}
        onBack={back}
        right={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            جدید
          </Button>
        }
      />

      <div className="p-4">
        {config.searchKey ? (
          <div className="relative mb-3">
            <Search className="size-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`جستجوی ${config.entityFa}…`}
              className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 text-sm outline-none"
            />
          </div>
        ) : null}

        {loading && items.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : error && items.length === 0 ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState title={`${config.entityFa}ی ثبت نشده است`} hint="با دکمه «جدید» اولین مورد را اضافه کنید." />
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => {
              const isActive = (item as unknown as { isActive?: boolean }).isActive !== false
              return (
                <div key={item.id} className="rounded-xl border border-border bg-card p-3.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{config.renderPrimary(item)}</p>
                    {config.renderSecondary ? (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{config.renderSecondary(item)}</p>
                    ) : null}
                  </div>
                  {!isActive ? <span className="text-[10px] bg-zinc-100 text-zinc-500 rounded-md px-1.5 py-0.5">غیرفعال</span> : null}
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="size-10 rounded-lg flex items-center justify-center text-accent hover:bg-secondary"
                    aria-label="ویرایش"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(item)}
                    className="size-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary"
                    aria-label="فعال/غیرفعال"
                  >
                    <Power className="size-4" />
                  </button>
                </div>
              )
            })}
            {items.length > 0 ? (
              <p className="text-center text-[10px] text-muted-foreground pt-2">{toFa(items.length)} مورد</p>
            ) : null}
          </div>
        )}
      </div>

      {/* فرم ایجاد/ویرایش */}
      {editing ? (
        <CrudForm
          title={editing === 'new' ? `${config.entityFa} جدید` : `ویرایش ${config.entityFa}`}
          fields={config.fields}
          workshops={workshops}
          initial={
            editing === 'new'
              ? config.defaultValues()
              : { ...(editing as T as unknown as Record<string, unknown>) }
          }
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}
    </div>
  )
}

function CrudForm({
  title,
  fields,
  workshops,
  initial,
  saving,
  onSave,
  onCancel,
}: {
  title: string
  fields: CrudField[]
  workshops: Array<{ id: string; name: string }>
  initial: Record<string, unknown>
  saving: boolean
  onSave: (values: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>(initial)
  const [wsOpen, setWsOpen] = useState(false)

  const set = (key: string, v: unknown) => setValues((p) => ({ ...p, [key]: v }))

  return (
    <Drawer.Root open onOpenChange={(o) => !o && onCancel()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none max-h-[90dvh] overflow-y-auto">
          <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
          <div className="p-5">
            <Drawer.Title className="font-semibold mb-4">{title}</Drawer.Title>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium mb-1.5">
                    {f.label}
                    {f.required ? <span className="text-red-500"> *</span> : null}
                  </label>
                  {f.type === 'switch' ? (
                    <Switch checked={!!values[f.key]} onCheckedChange={(c) => set(f.key, c)} className="scale-125 origin-right" />
                  ) : f.type === 'workshop' ? (
                    <button
                      type="button"
                      onClick={() => setWsOpen(true)}
                      className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11"
                    >
                      {values[f.key] ? workshops.find((w) => w.id === values[f.key])?.name ?? '—' : 'انتخاب کارگاه…'}
                    </button>
                  ) : f.type === 'select' ? (
                    <select
                      value={String(values[f.key] ?? '')}
                      onChange={(e) => set(f.key, e.target.value)}
                      className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm min-h-11"
                    >
                      <option value="">انتخاب…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={String(values[f.key] ?? '')}
                      onChange={(e) => set(f.key, e.target.value)}
                      type={f.type === 'number' ? 'text' : 'text'}
                      inputMode={f.type === 'number' ? 'numeric' : 'text'}
                      placeholder={f.placeholder}
                      className="bg-card"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-5">
              <Button variant="outline" onClick={onCancel} className="h-12 rounded-xl">
                انصراف
              </Button>
              <Button onClick={() => onSave(values)} disabled={saving} className="h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
                ذخیره
              </Button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
      <SelectionSheet
        open={wsOpen}
        onOpenChange={setWsOpen}
        title="انتخاب کارگاه"
        options={workshops.map((w) => ({ id: w.id, label: w.name }))}
        selected={[]}
        onConfirm={(ids) => set('workshopId', ids[0] ?? null)}
      />
    </Drawer.Root>
  )
}

// ─────────────────────────── پیکربندی صفحه‌های CRUD ───────────────────────────

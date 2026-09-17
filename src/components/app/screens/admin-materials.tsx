"use client"

import { toast } from 'sonner'
import { api, ClientApiError } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Power, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ScreenHeader, ListSkeleton, EmptyState, ErrorState, SelectionSheet } from '@/components/app/shared'
import { Drawer } from 'vaul'
import { Input } from '@/components/ui/input'
import { toFa } from '@/lib/fa'
import { ERROR_MSG } from '@/components/app/messages'

interface Material {
  id: string
  name: string
  category: string | null
  defaultUnit: string | null
  workshopId: string | null
  isActive: boolean
}

const UNITS = ['کیسه', 'تن', 'عدد', 'متر', 'مترمربع', 'مترمکعب', 'لیتر', 'بسته', 'پالت', 'دستگاه', 'ماشین', 'شاخه', 'رول']
const CATEGORIES = ['سیمان', 'آهن‌آلات', 'بنایی', 'شن و ماسه', 'عایق', 'لوله و اتصالات', 'سیم و کابل', 'رنگ', 'کاشی و سرامیک', 'سایر']

export default function AdminMaterials() {
  const [items, setItems] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Material | 'new' | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [defaultUnit, setDefaultUnit] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [catOpen, setCatOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<{ materials: Material[] }>('/api/v1/admin/materials')
      setItems(res.materials)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
     
  }, [])

  async function save() {
    if (!name.trim()) {
      toast.error('نام مصالح را وارد کنید.')
      return
    }
    setSaving(true)
    try {
      const payload = { name: name.trim(), category: category || null, defaultUnit: defaultUnit || null, isActive }
      if (editing === 'new') await api.post('/api/v1/admin/materials', payload)
      else if (editing) await api.patch(`/api/v1/admin/materials/${editing.id}`, payload)
      toast.success('ذخیره شد.')
      setEditing(null)
      await load()
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error(ERROR_MSG)
    } finally {
      setSaving(false)
    }
  }

  const filtered = query.trim() ? items.filter((m) => m.name.includes(query.trim())) : items

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader
        title="مصالح"
        right={
          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => {
              setName('')
              setCategory('')
              setDefaultUnit('')
              setIsActive(true)
              setEditing('new')
            }}
          >
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
            placeholder="جستجوی مصالح…"
            className="w-full h-11 rounded-xl bg-secondary border-0 pr-10 text-sm outline-none"
          />
        </div>

        {loading && items.length === 0 ? (
          <ListSkeleton rows={5} />
        ) : error && items.length === 0 ? (
          <ErrorState message={ERROR_MSG} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="مصالحی ثبت نشده است" hint="با دکمه «جدید» مصالح اضافه کنید." />
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {m.category ?? '—'} · واحد پیش‌فرض: {m.defaultUnit ?? '—'}
                  </p>
                </div>
                {!m.isActive ? <span className="text-[10px] bg-zinc-100 text-zinc-500 rounded-md px-1.5 py-0.5">غیرفعال</span> : null}
                <button
                  type="button"
                  onClick={() => {
                    setEditing(m)
                    setName(m.name)
                    setCategory(m.category ?? '')
                    setDefaultUnit(m.defaultUnit ?? '')
                    setIsActive(m.isActive)
                  }}
                  className="size-10 rounded-lg flex items-center justify-center text-accent hover:bg-secondary"
                  aria-label="ویرایش"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await api.patch(`/api/v1/admin/materials/${m.id}`, { isActive: !m.isActive }).catch(() => undefined)
                    await load()
                  }}
                  className="size-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary"
                  aria-label="فعال/غیرفعال"
                >
                  <Power className="size-4" />
                </button>
              </div>
            ))}
            <p className="text-center text-[10px] text-muted-foreground pt-2">{toFa(items.length)} قلم مصالح</p>
          </div>
        )}
      </div>

      {/* فرم */}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setEditing(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg mx-auto rounded-t-2xl bg-card p-5 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-4">{editing === 'new' ? 'مصالح جدید' : 'ویرایش مصالح'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">نام مصالح <span className="text-red-500">*</span></label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: سیمان تیپ دو" className="bg-secondary/60 border-0" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">دسته‌بندی</label>
                <button type="button" onClick={() => setCatOpen(true)} className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11">
                  {category || 'انتخاب دسته…'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">واحد پیش‌فرض</label>
                <button type="button" onClick={() => setUnitOpen(true)} className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm text-right min-h-11">
                  {defaultUnit || 'انتخاب واحد…'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">فعال</span>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-5 accent-amber-600" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-5">
              <Button variant="outline" onClick={() => setEditing(null)} className="h-12 rounded-xl">
                انصراف
              </Button>
              <Button onClick={() => void save()} disabled={saving} className="h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
                ذخیره
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Drawer.Root open={catOpen} onOpenChange={setCatOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card outline-none max-h-[70dvh] overflow-y-auto">
            <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300" />
            <div className="p-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c)
                    setCatOpen(false)
                  }}
                  className="w-full text-right rounded-xl px-4 py-3 hover:bg-secondary min-h-11"
                >
                  {c}
                </button>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      <SelectionSheet
        open={unitOpen}
        onOpenChange={setUnitOpen}
        title="واحد اندازه‌گیری"
        searchable={false}
        options={UNITS.map((u) => ({ id: u, label: u }))}
        selected={[]}
        onConfirm={(ids) => setDefaultUnit(ids[0] ?? '')}
      />
    </div>
  )
}

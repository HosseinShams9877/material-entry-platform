"use client"

import { AdminCrud } from '@/components/app/admin-crud'

interface Supplier {
  id: string
  name: string
  phone: string | null
  workshopId: string | null
  workshops: Array<{ id: string; name: string }>
  isActive: boolean
}

// تأمین‌کننده چند-کارگاهی — می‌تواند به چند کارگاه assign شود
export default function AdminSuppliers() {
  return (
    <AdminCrud<Supplier>
      config={{
        screenTitle: 'تأمین‌کنندگان',
        entityFa: 'تأمین‌کننده',
        endpoint: '/api/v1/admin/suppliers',
        fields: [
          { key: 'name', label: 'نام تأمین‌کننده', type: 'text', required: true, placeholder: 'مثلاً: شرکت X' },
          { key: 'phone', label: 'تلفن', type: 'text' },
          { key: 'workshopIds', label: 'کارگاه‌های مرتبط (چندگانه)', type: 'workshop-multi' },
          { key: 'isActive', label: 'فعال', type: 'switch' },
        ],
        renderPrimary: (s) => s.name,
        renderSecondary: (s) => {
          const ws = (s.workshops ?? []).map((w) => w.name).join('، ')
          return [s.phone, ws].filter(Boolean).join(' · ') || undefined
        },
        defaultValues: () => ({ name: '', phone: '', workshopId: null, workshopIds: [], isActive: true }),
      }}
    />
  )
}

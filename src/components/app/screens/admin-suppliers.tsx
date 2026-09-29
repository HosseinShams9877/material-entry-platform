"use client"

import { AdminCrud } from '@/components/app/admin-crud'

interface Supplier {
  id: string
  name: string
  phone: string | null
  workshopId: string | null
  isActive: boolean
}

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
          { key: 'workshopId', label: 'کارگاه مرتبط', type: 'workshop' },
          { key: 'isActive', label: 'فعال', type: 'switch' },
        ],
        renderPrimary: (s) => s.name,
        renderSecondary: (s) => s.phone ?? undefined,
        defaultValues: () => ({ name: '', phone: '', workshopId: null, isActive: true }),
      }}
    />
  )
}

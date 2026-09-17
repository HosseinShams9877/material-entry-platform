"use client"

import { AdminCrud } from '@/components/app/admin-crud'

interface Workshop {
  id: string
  name: string
  code: string
  address: string | null
  isActive: boolean
}

export default function AdminWorkshops() {
  return (
    <AdminCrud<Workshop>
      config={{
        screenTitle: 'کارگاه‌ها',
        entityFa: 'کارگاه',
        endpoint: '/api/v1/admin/workshops',
        fields: [
          { key: 'name', label: 'نام کارگاه', type: 'text', required: true, placeholder: 'مثلاً: کارگاه پروژه سعادت‌آباد' },
          { key: 'code', label: 'کد کارگاه', type: 'text', required: true, placeholder: 'مثلاً: WH-001' },
          { key: 'address', label: 'آدرس', type: 'text' },
          { key: 'isActive', label: 'فعال', type: 'switch' },
        ],
        renderPrimary: (w) => w.name,
        renderSecondary: (w) => `${w.code}${w.address ? ` · ${w.address}` : ''}`,
        defaultValues: () => ({ name: '', code: '', address: '', isActive: true }),
      }}
    />
  )
}

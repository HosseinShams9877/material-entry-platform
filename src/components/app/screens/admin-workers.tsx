"use client"

import { AdminCrud } from '@/components/app/admin-crud'
import { WORKER_KINDS } from '@/lib/permissions'

interface Worker {
  id: string
  fullName: string
  kind: string
  phone: string | null
  workshopId: string | null
  isActive: boolean
}

export default function AdminWorkers() {
  return (
    <AdminCrud<Worker>
      config={{
        screenTitle: 'کارگران و افراد',
        entityFa: 'فرد',
        endpoint: '/api/v1/admin/workers',
        fields: [
          { key: 'fullName', label: 'نام و نام خانوادگی', type: 'text', required: true, placeholder: 'مثلاً: علی محمدی' },
          {
            key: 'kind',
            label: 'نقش',
            type: 'select',
            options: Object.entries(WORKER_KINDS).map(([value, label]) => ({ value, label })),
          },
          { key: 'phone', label: 'تلفن', type: 'text' },
          { key: 'workshopId', label: 'کارگاه', type: 'workshop' },
          { key: 'isActive', label: 'فعال', type: 'switch' },
        ],
        renderPrimary: (w) => w.fullName,
        renderSecondary: (w) => `${WORKER_KINDS[w.kind as keyof typeof WORKER_KINDS] ?? w.kind}${w.phone ? ` · ${w.phone}` : ''}`,
        defaultValues: () => ({ fullName: '', kind: 'LABORER', phone: '', workshopId: null, isActive: true }),
      }}
    />
  )
}

"use client"

import { AdminCrud } from '@/components/app/admin-crud'

interface Project {
  id: string
  name: string
  code: string
  clientName: string | null
  workshopId: string | null
  isActive: boolean
}

export default function AdminProjects() {
  return (
    <AdminCrud<Project>
      config={{
        screenTitle: 'پروژه‌ها',
        entityFa: 'پروژه',
        endpoint: '/api/v1/admin/projects',
        fields: [
          { key: 'name', label: 'نام پروژه', type: 'text', required: true, placeholder: 'مثلاً: سعادت‌آباد' },
          { key: 'code', label: 'کد پروژه', type: 'text', required: true, placeholder: 'مثلاً: PRJ-01' },
          { key: 'clientName', label: 'کارفرما', type: 'text' },
          { key: 'workshopId', label: 'کارگاه مرتبط', type: 'workshop' },
          { key: 'isActive', label: 'فعال', type: 'switch' },
        ],
        renderPrimary: (p) => p.name,
        renderSecondary: (p) => `${p.code}${p.clientName ? ` · کارفرما: ${p.clientName}` : ''}`,
        defaultValues: () => ({ name: '', code: '', clientName: '', workshopId: null, isActive: true }),
      }}
    />
  )
}

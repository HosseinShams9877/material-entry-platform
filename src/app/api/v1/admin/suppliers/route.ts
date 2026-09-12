import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { supplierSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

export const GET = apiHandler(
  async ({ req }) => {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    const suppliers = await db.supplier.findMany({
      where: q ? { name: { contains: q } } : {},
      include: { workshop: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    })
    return ok({ suppliers })
  },
  { permission: 'masterdata.manage' }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const created = await db.supplier.create({ data: body })
    await writeAudit({ user, action: 'CREATE', entityType: 'Supplier', entityId: created.id, newValue: { name: created.name }, ip, userAgent })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'masterdata.manage', schema: supplierSchema }
)

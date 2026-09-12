import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { workerSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

export const GET = apiHandler(
  async ({ req }) => {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    const kind = req.nextUrl.searchParams.get('kind') ?? ''
    const workers = await db.worker.findMany({
      where: {
        ...(q ? { fullName: { contains: q } } : {}),
        ...(kind && kind !== 'ALL' ? { kind } : {}),
      },
      include: { workshop: { select: { id: true, name: true } } },
      orderBy: { fullName: 'asc' },
    })
    return ok({ workers })
  },
  { permission: 'masterdata.manage' }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const created = await db.worker.create({ data: body })
    await writeAudit({ user, action: 'CREATE', entityType: 'Worker', entityId: created.id, newValue: { fullName: created.fullName }, ip, userAgent })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'masterdata.manage', schema: workerSchema }
)

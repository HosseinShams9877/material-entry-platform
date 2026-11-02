import { db } from '@/lib/db'
import { apiHandler, ok } from '@/lib/api'
import { materialSchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

export const GET = apiHandler(
  async ({ req }) => {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    const materials = await db.material.findMany({
      where: q ? { name: { contains: q } } : {},
      include: {
        workshop: { select: { id: true, name: true } },
        categoryRef: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    })
    return ok({ materials })
  },
  { permission: 'masterdata.manage' }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    // همگام‌سازی نام دسته — categoryRef و متن category با هم می‌مانند
    let category = body.category ?? null
    if (body.categoryId) {
      const cat = await db.materialCategory.findUnique({ where: { id: body.categoryId } })
      if (cat) category = cat.name
    }
    const created = await db.material.create({
      data: { ...body, category },
    })
    await writeAudit({ user, action: 'CREATE', entityType: 'Material', entityId: created.id, newValue: { name: created.name }, ip, userAgent })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'masterdata.manage', schema: materialSchema }
)

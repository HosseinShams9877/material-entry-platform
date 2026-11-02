import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { materialCategorySchema } from '@/lib/validate'
import { writeAudit } from '@/lib/audit'

// ─────────────────────────── دسته‌بندی مصالح — CRUD ───────────────────────────

export const GET = apiHandler(
  async () => {
    const categories = await db.materialCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { materials: true } } },
    })
    return ok({ categories })
  },
  { permission: 'masterdata.manage' }
)

export const POST = apiHandler(
  async ({ body, user, ip, userAgent }) => {
    const name = body.name.trim()
    const existing = await db.materialCategory.findUnique({ where: { name } })
    if (existing) throw new ApiError(409, 'DUPLICATE', 'دسته‌بندی‌ای با این نام از قبل وجود دارد.')

    const created = await db.materialCategory.create({
      data: { name, isActive: body.isActive },
    })
    await writeAudit({ user, action: 'CREATE', entityType: 'MaterialCategory', entityId: created.id, newValue: { name: created.name }, ip, userAgent })
    return ok({ id: created.id }, { status: 201 })
  },
  { permission: 'masterdata.manage', schema: materialCategorySchema }
)

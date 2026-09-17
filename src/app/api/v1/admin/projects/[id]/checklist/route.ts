import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { checklistItemSchema } from '@/lib/validate'

// الگوی پیش‌فرض چک‌لیست شروع پروژه — در اولین بازدید seed می‌شود
const DEFAULT_CHECKLIST = [
  'قرارداد و اسناد پروژه کامل است',
  'کارگاه تحویل و ابلاغ شد',
  'نیروی انسانی اولیه تأمین شد',
  'مصالح پایه (سیمان/آهن/شن و ماسه) سفارش داده شد',
  'مجوزها و بیمهٔ کارگاه انجام شد',
  'تجهیزات و ماشین‌آلات موردنیاز آماده است',
  'انبارداری و فرم‌های ثبت مصالح راه‌اندازی شد',
]

// ─────────────────────────── GET /api/v1/admin/projects/[id]/checklist — چک‌لیست پروژه ───────────────────────────
// در اولین بازدید، الگوی پیش‌فرض چک‌لیست شروع پروژه به‌صورت تنبل ساخته می‌شود.

export const GET = apiHandler(
  async ({ params }) => {
    const project = await db.project.findUnique({ where: { id: params.id }, select: { id: true, name: true } })
    if (!project) throw new ApiError(404, 'NOT_FOUND', 'پروژه یافت نشد.')

    let items = await db.projectChecklistItem.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: 'asc' },
    })

    if (items.length === 0) {
      await db.projectChecklistItem.createMany({
        data: DEFAULT_CHECKLIST.map((title, idx) => ({ projectId: project.id, title, sortOrder: idx })),
      })
      items = await db.projectChecklistItem.findMany({
        where: { projectId: project.id },
        orderBy: { sortOrder: 'asc' },
      })
    }

    const done = items.filter((i) => i.isDone).length
    return ok({
      projectId: project.id,
      projectName: project.name,
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        sortOrder: i.sortOrder,
        isDone: i.isDone,
        doneAt: i.doneAt?.toISOString() ?? null,
        note: i.note,
      })),
      progress: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
    })
  },
  { permission: 'reports.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'checklist' } }
)

// ─────────────────────────── POST /api/v1/admin/projects/[id]/checklist — افزودن آیتم ───────────────────────────

export const POST = apiHandler(
  async ({ params, user, body, ip, userAgent }) => {
    const project = await db.project.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!project) throw new ApiError(404, 'NOT_FOUND', 'پروژه یافت نشد.')

    const last = await db.projectChecklistItem.findFirst({
      where: { projectId: project.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })

    const created = await db.projectChecklistItem.create({
      data: {
        projectId: project.id,
        title: body.title,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    })

    await writeAudit({
      user,
      action: 'CHECKLIST_UPDATE',
      entityType: 'ProjectChecklistItem',
      entityId: created.id,
      newValue: { projectId: project.id, title: created.title, added: true },
      ip,
      userAgent,
    })

    return ok(
      { id: created.id, title: created.title, sortOrder: created.sortOrder, isDone: created.isDone, doneAt: null, note: null },
      { status: 201 }
    )
  },
  { permission: 'checklist.update', schema: checklistItemSchema, rateLimit: { limit: 30, windowMs: 60_000, scope: 'checklist-write' } }
)

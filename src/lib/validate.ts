import { z } from 'zod'

// ─────────────────────────── اسکیمای اعتبارسنجی مشترک (Frontend + Backend) ───────────────────────────
// Backend مرجع نهایی Validation است.


export const loginSchema = z.object({
  username: z
    .string({ message: 'نام کاربری را وارد کنید.' })
    .trim()
    .min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد.'),
  password: z
    .string({ message: 'گذرواژه را وارد کنید.' })
    .min(4, 'گذرواژه باید حداقل ۴ کاراکتر باشد.'),
})
export type LoginInput = z.infer<typeof loginSchema>

const qtySchema = z.coerce
  .number({ message: 'مقدار را وارد کنید.' })
  .positive('مقدار باید بزرگ‌تر از صفر باشد.')
  .max(1_000_000_000, 'مقدار وارد شده بیش از حد بزرگ است.')

export const entryItemSchema = z.object({
  materialId: z.string().trim().min(1).optional().nullable(),
  materialName: z.string().trim().min(1, 'نام مصالح را وارد کنید.').max(200, 'نام مصالح خیلی طولانی است.'),
  quantity: qtySchema,
  unit: z.string().trim().min(1, 'واحد اندازه‌گیری را انتخاب کنید.').max(50),
  brand: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  batchNumber: z.string().trim().max(100).optional().nullable(),
  serialNumber: z.string().trim().max(100).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
})
export type EntryItemInput = z.infer<typeof entryItemSchema>

export const createEntrySchema = z.object({
  type: z.enum(['PURCHASE', 'TRANSFER', 'LOAN', 'RETURN', 'OTHER'], { message: 'نوع ورود را انتخاب کنید.' }),
  sourceType: z.enum(['SUPPLIER', 'WORKSHOP', 'OTHER'], { message: 'نوع مبدأ را انتخاب کنید.' }),
  sourceSupplierId: z.string().trim().optional().nullable(),
  sourceWorkshopId: z.string().trim().optional().nullable(),
  sourceDescription: z.string().trim().max(300).optional().nullable(),
  projectIds: z.array(z.string().trim().min(1, 'پروژه را انتخاب کنید.')).min(1, 'حداقل یک پروژه انتخاب کنید.'),
  items: z.array(entryItemSchema).min(1, 'حداقل یک قلم مصالح اضافه کنید.'),
  workers: z
    .array(
      z.object({
        workerId: z.string().trim().optional().nullable(),
        workerName: z.string().trim().min(1, 'نام فرد را وارد کنید.').max(120),
        workerKind: z.enum(['LABORER', 'DRIVER', 'FORKLIFT', 'CONTRACTOR', 'OTHER']).default('LABORER'),
        role: z.string().trim().max(120).optional().nullable(),
      })
    )
    .default([]),
  notes: z.string().trim().max(1000).optional().nullable(),
  hasInvoice: z.boolean().default(false),
  // تاریخ ورود مصالح — رشتهٔ ISO تاریخ (YYYY-MM-DD) از تقویم شمسی
  deliveryAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ ورود معتبر نیست.')
    .optional()
    .nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED']).default('DRAFT'),
  voiceTranscriptId: z.string().trim().optional().nullable(),
  // Idempotency — شناسهٔ یکتای سمت کلاینت برای Sync آفلاین (UUID)
  clientRequestId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9-]{8,64}$/, 'شناسهٔ درخواست نامعتبر است.')
    .optional()
    .nullable(),
})
export type CreateEntryInput = z.infer<typeof createEntrySchema>

export const updateEntrySchema = createEntrySchema.omit({ status: true, voiceTranscriptId: true, clientRequestId: true })
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>

export const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CORRECTION'], { message: 'نوع بررسی مشخص نیست.' }),
  reason: z
    .string()
    .trim()
    .max(500, 'توضیح خیلی طولانی است.')
    .optional()
    .nullable(),
}).refine(
  (v) => v.action === 'APPROVE' || (v.reason && v.reason.length >= 3),
  { message: 'برای رد یا درخواست اصلاح، نوشتن دلیل الزامی است.', path: ['reason'] }
)
export type ReviewInput = z.infer<typeof reviewSchema>

export const correctionRequestSchema = z.object({
  reason: z
    .string({ message: 'علت درخواست اصلاح را بنویسید.' })
    .trim()
    .min(5, 'لطفاً علت اصلاح را کامل‌تر بنویسید.')
    .max(500),
})
export type CorrectionRequestInput = z.infer<typeof correctionRequestSchema>

export const reviewCorrectionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED'], { message: 'نتیجه بررسی مشخص نیست.' }),
  responseNote: z.string().trim().max(500).optional().nullable(),
})

export const createUserSchema = z.object({
  username: z
    .string({ message: 'نام کاربری را وارد کنید.' })
    .trim()
    .min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد.')
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'نام کاربری فقط شامل حروف انگلیسی، عدد و نقطه/خط تیره باشد.'),
  password: z.string({ message: 'گذرواژه را وارد کنید.' }).min(6, 'گذرواژه باید حداقل ۶ کاراکتر باشد.'),
  fullName: z.string({ message: 'نام و نام خانوادگی را وارد کنید.' }).trim().min(3, 'نام کامل را وارد کنید.').max(120),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'WORKSHOP_MANAGER', 'WORKSHOP_SUPERVISOR'], {
    message: 'نقش کاربر را انتخاب کنید.',
  }),
  phone: z.string().trim().max(20).optional().nullable(),
  workshopId: z.string().trim().optional().nullable(),
  projectIds: z.array(z.string()).default([]),
  workshopAccessIds: z.array(z.string()).default([]),
})
export type CreateUserInput = z.infer<typeof createUserSchema>

export const updateUserSchema = createUserSchema.partial().extend({
  isActive: z.boolean().optional(),
  password: z.string().min(6, 'گذرواژه باید حداقل ۶ کاراکتر باشد.').optional().or(z.literal('')),
})

export const workshopSchema = z.object({
  name: z.string({ message: 'نام کارگاه را وارد کنید.' }).trim().min(2, 'نام کارگاه را کامل‌تر وارد کنید.').max(150),
  code: z.string().trim().min(2, 'کد کارگاه را وارد کنید.').max(30),
  address: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().default(true),
})
export const projectSchema = z.object({
  name: z.string({ message: 'نام پروژه را وارد کنید.' }).trim().min(2, 'نام پروژه را کامل‌تر وارد کنید.').max(150),
  code: z.string().trim().min(2, 'کد پروژه را وارد کنید.').max(30),
  workshopId: z.string().trim().optional().nullable(),
  clientName: z.string().trim().max(150).optional().nullable(),
  isActive: z.boolean().default(true),
})
export const materialSchema = z.object({
  name: z.string({ message: 'نام مصالح را وارد کنید.' }).trim().min(2, 'نام مصالح را کامل‌تر وارد کنید.').max(150),
  category: z.string().trim().max(80).optional().nullable(),
  defaultUnit: z.string().trim().max(50).optional().nullable(),
  workshopId: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true),
})
export const supplierSchema = z.object({
  name: z.string({ message: 'نام تأمین‌کننده را وارد کنید.' }).trim().min(2, 'نام تأمین‌کننده را کامل‌تر وارد کنید.').max(150),
  phone: z.string().trim().max(20).optional().nullable(),
  workshopId: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true),
})
export const workerSchema = z.object({
  fullName: z.string({ message: 'نام فرد را وارد کنید.' }).trim().min(2, 'نام را کامل‌تر وارد کنید.').max(120),
  kind: z.enum(['LABORER', 'DRIVER', 'FORKLIFT', 'CONTRACTOR', 'OTHER']).default('LABORER'),
  phone: z.string().trim().max(20).optional().nullable(),
  workshopId: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true),
})

// ─────────────────────────── ماژول وظایف و گزارش روزانه ───────────────────────────

/** تاریخ ISO «YYYY-MM-DD» — از تقویم شمسی کلاینت می‌آید و سمت سرور به UTC تبدیل می‌شود */
const isoDate = z
  .string({ message: 'تاریخ را انتخاب کنید.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ معتبر نیست.')

/** لحظهٔ UTC (ISO 8601 کامل) — مهلت انجام */
const utcDateTime = z
  .string({ message: 'مهلت انجام معتبر نیست.' })
  .datetime({ offset: true, message: 'مهلت انجام باید لحظهٔ UTC معتبر باشد.' })

export const taskItemSchema = z.object({
  id: z.string().trim().optional().nullable(), // برای ویرایش — آیتم موجود
  title: z.string({ message: 'عنوان آیتم را وارد کنید.' }).trim().min(2, 'عنوان آیتم را کامل‌تر بنویسید.').max(200),
  description: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
})
export type TaskItemInput = z.infer<typeof taskItemSchema>

const baseTaskFields = {
  projectId: z.string({ message: 'پروژه را انتخاب کنید.' }).trim().min(1, 'پروژه را انتخاب کنید.'),
  workshopId: z.string({ message: 'کارگاه را انتخاب کنید.' }).trim().min(1, 'کارگاه را انتخاب کنید.'),
  title: z.string({ message: 'عنوان وظیفه را وارد کنید.' }).trim().min(3, 'عنوان وظیفه را کامل‌تر بنویسید.').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], { message: 'اولویت را انتخاب کنید.' }).default('MEDIUM'),
  assignedDate: isoDate,
  dueDate: utcDateTime.optional().nullable(),
}

export const createTaskSchema = z.object({
  ...baseTaskFields,
  assigneeIds: z.array(z.string().trim().min(1)).default([]),
  items: z.array(taskItemSchema).max(50, 'حداکثر ۵۰ آیتم مجاز است.').default([]),
  sourceType: z.enum(['MANUAL', 'VOICE']).default('MANUAL'),
  sourceAudioId: z.string().trim().optional().nullable(),
  sourceTranscript: z.string().trim().max(8000).optional().nullable(),
})
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = z
  .object({
    ...baseTaskFields,
    assigneeIds: z.array(z.string().trim().min(1)).optional(),
    items: z.array(taskItemSchema).max(50, 'حداکثر ۵۰ آیتم مجاز است.').optional(),
    sourceTranscript: z.string().trim().max(8000).optional().nullable(),
  })
  .partial()
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

export const sendTaskSchema = z.object({
  assigneeIds: z.array(z.string().trim().min(1)).min(1, 'حداقل یک سرپرست انتخاب کنید.').optional(),
})

export const completeItemSchema = z.object({
  note: z.string().trim().max(500, 'توضیح خیلی طولانی است.').optional().nullable(),
})

export const completeTaskSchema = z.object({
  note: z.string().trim().max(500, 'توضیح خیلی طولانی است.').optional().nullable(),
})

export const cancelTaskSchema = z.object({
  reason: z
    .string({ message: 'علت لغو را بنویسید.' })
    .trim()
    .min(3, 'علت لغو را کامل‌تر بنویسید.')
    .max(500),
})

export const taskCommentSchema = z.object({
  content: z.string({ message: 'متن دیدگاه را وارد کنید.' }).trim().min(1, 'متن دیدگاه را وارد کنید.').max(1000),
  audioId: z.string().trim().optional().nullable(),
})

export const createReportSchema = z.object({
  projectId: z.string({ message: 'پروژه را انتخاب کنید.' }).trim().min(1, 'پروژه را انتخاب کنید.'),
  workshopId: z.string({ message: 'کارگاه را انتخاب کنید.' }).trim().min(1, 'کارگاه را انتخاب کنید.'),
  reportDate: isoDate,
  title: z.string({ message: 'عنوان گزارش را وارد کنید.' }).trim().min(3, 'عنوان گزارش را کامل‌تر بنویسید.').max(200),
  content: z.string({ message: 'متن گزارش را وارد کنید.' }).trim().min(3, 'متن گزارش را وارد کنید.').max(8000),
  sourceType: z.enum(['MANUAL', 'VOICE']).default('MANUAL'),
  audioId: z.string().trim().optional().nullable(),
  transcript: z.string().trim().max(8000).optional().nullable(),
  // Idempotency — ضد گزارش تکراری در Sync آفلاین
  clientRequestId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9-]{8,64}$/, 'شناسهٔ درخواست نامعتبر است.')
    .optional()
    .nullable(),
})
export type CreateReportInput = z.infer<typeof createReportSchema>

export const updateReportSchema = createReportSchema.partial().omit({ sourceType: true, audioId: true })
export type UpdateReportInput = z.infer<typeof updateReportSchema>

export const reviewReportSchema = z.object({
  note: z.string().trim().max(500, 'توضیح خیلی طولانی است.').optional().nullable(),
})

export const extractItemsSchema = z.object({
  transcript: z.string({ message: 'متن گفتار خالی است.' }).trim().min(3, 'متن گفتار خالی است.').max(8000),
})

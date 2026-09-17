import { z } from 'zod'
import { ROLES } from '@/lib/permissions'

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
  // Idempotency — شناسهٔ یکتای سمت کلاینت برای Sync آفلاین (UUID)
  clientRequestId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9-]{8,64}$/, 'شناسهٔ درخواست نامعتبر است.')
    .optional()
    .nullable(),
})
export type CreateEntryInput = z.infer<typeof createEntrySchema>

export const updateEntrySchema = createEntrySchema.omit({ status: true, clientRequestId: true })
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
  // همهٔ نقش‌های سیستم — از ROLES استخراج می‌شود (برای نقش‌های جدید خودکار باز می‌شود)
  role: z.enum(Object.keys(ROLES) as [keyof typeof ROLES, ...(keyof typeof ROLES)[]], {
    message: 'نقش کاربر را انتخاب کنید.',
  }),
  phone: z.string().trim().max(20).optional().nullable(),
  workshopId: z.string().trim().optional().nullable(),
  // لینک حساب به پروفایل کارگر — الزامی برای نیروی اجرایی (خوداظهاری)
  workerId: z.string().trim().optional().nullable(),
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
  jobTitle: z.string().trim().max(200, 'شرح وظایف خیلی طولانی است.').optional().nullable(),
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
})
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = z
  .object({
    ...baseTaskFields,
    assigneeIds: z.array(z.string().trim().min(1)).optional(),
    items: z.array(taskItemSchema).max(50, 'حداکثر ۵۰ آیتم مجاز است.').optional(),
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
})

export const createReportSchema = z.object({
  projectId: z.string({ message: 'پروژه را انتخاب کنید.' }).trim().min(1, 'پروژه را انتخاب کنید.'),
  workshopId: z.string({ message: 'کارگاه را انتخاب کنید.' }).trim().min(1, 'کارگاه را انتخاب کنید.'),
  reportDate: isoDate,
  title: z.string({ message: 'عنوان گزارش را وارد کنید.' }).trim().min(3, 'عنوان گزارش را کامل‌تر بنویسید.').max(200),
  content: z.string({ message: 'متن گزارش را وارد کنید.' }).trim().min(3, 'متن گزارش را وارد کنید.').max(8000),
  // sourceType منسوخ است (ماژول صوت حذف شده) — در صورت ارسال از سوی کلاینت‌های قدیمی نادیده گرفته می‌شود
  // Idempotency — ضد گزارش تکراری در Sync آفلاین
  clientRequestId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9-]{8,64}$/, 'شناسهٔ درخواست نامعتبر است.')
    .optional()
    .nullable(),
})
export type CreateReportInput = z.infer<typeof createReportSchema>

export const updateReportSchema = createReportSchema.partial()
export type UpdateReportInput = z.infer<typeof updateReportSchema>

export const reviewReportSchema = z.object({
  note: z.string().trim().max(500, 'توضیح خیلی طولانی است.').optional().nullable(),
})

// ─────────────────────────── صورت وضعیت ───────────────────────────

/** مبلغ به تومان — تا ۱ هزار میلیارد */
const amountSchema = z.coerce
  .number({ message: 'مبلغ صورت وضعیت را وارد کنید.' })
  .positive('مبلغ باید بزرگ‌تر از صفر باشد.')
  .max(1_000_000_000_000, 'مبلغ وارد شده بیش از حد بزرگ است.')

export const createStatementSchema = z.object({
  workshopId: z.string({ message: 'کارگاه را انتخاب کنید.' }).trim().min(1, 'کارگاه را انتخاب کنید.'),
  projectId: z.string().trim().optional().nullable(),
  title: z.string({ message: 'عنوان صورت وضعیت را وارد کنید.' }).trim().min(3, 'عنوان را کامل‌تر بنویسید.').max(200),
  periodText: z.string().trim().max(100, 'دورهٔ خیلی طولانی است.').optional().nullable(),
  amount: amountSchema,
  description: z.string().trim().max(4000, 'شرح خیلی طولانی است.').optional().nullable(),
})
export type CreateStatementInput = z.infer<typeof createStatementSchema>

export const updateStatementSchema = createStatementSchema.partial()
export type UpdateStatementInput = z.infer<typeof updateStatementSchema>

export const decideStatementSchema = z.object({
  note: z.string().trim().max(500, 'توضیح خیلی طولانی است.').optional().nullable(),
})

export const rejectStatementSchema = z.object({
  reason: z
    .string({ message: 'علت رد را بنویسید.' })
    .trim()
    .min(3, 'علت رد را کامل‌تر بنویسید.')
    .max(500),
})

export const signStatementSchema = z.object({
  /** امضای دستی مدیر کل — dataURL تصویر PNG از پد امضا */
  signatureData: z
    .string({ message: 'امضا را رسم کنید.' })
    .trim()
    .min(50, 'امضا را رسم کنید.')
    .max(400_000, 'تصویر امضا خیلی بزرگ است.')
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'قالب امضا معتبر نیست.'),
})
export type SignStatementInput = z.infer<typeof signStatementSchema>

// ─────────────────────────── اعلام نیاز و کنترل خرید ───────────────────────────

export const purchaseItemSchema = z.object({
  materialId: z.string().trim().min(1).optional().nullable(),
  materialName: z.string({ message: 'نام مصالح را وارد کنید.' }).trim().min(1, 'نام مصالح را وارد کنید.').max(200),
  quantity: qtySchema,
  unit: z.string({ message: 'واحد اندازه‌گیری را انتخاب کنید.' }).trim().min(1, 'واحد اندازه‌گیری را انتخاب کنید.').max(50),
  note: z.string().trim().max(300).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
})
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>

export const createPurchaseSchema = z.object({
  workshopId: z.string({ message: 'کارگاه را انتخاب کنید.' }).trim().min(1, 'کارگاه را انتخاب کنید.'),
  projectId: z.string().trim().optional().nullable(),
  neededBy: isoDate.optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  items: z.array(purchaseItemSchema).min(1, 'حداقل یک قلم نیاز اضافه کنید.').max(50, 'حداکثر ۵۰ قلم مجاز است.'),
})
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>

export const updatePurchaseSchema = createPurchaseSchema.partial()
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>

export const rejectPurchaseSchema = z.object({
  reason: z
    .string({ message: 'علت رد را بنویسید.' })
    .trim()
    .min(3, 'علت رد را کامل‌تر بنویسید.')
    .max(500),
})

/** ثبت خرید — تأمین‌کننده + تاریخ تحویل + مبلغ اختیاری + سررسید/شرایط پرداخت (مالی ساده سند) */
export const orderPurchaseSchema = z.object({
  supplierId: z.string().trim().min(1, 'تأمین‌کننده را انتخاب کنید.').optional().nullable(),
  supplierName: z.string().trim().max(150).optional().nullable(),
  expectedDeliveryAt: isoDate.optional().nullable(),
  totalAmount: z.coerce
    .number({ message: 'مبلغ نامعتبر است.' })
    .positive('مبلغ باید بزرگ‌تر از صفر باشد.')
    .max(1_000_000_000_000, 'مبلغ وارد شده بیش از حد بزرگ است.')
    .optional()
    .nullable(),
  orderNote: z.string().trim().max(1000).optional().nullable(),
  dueDate: isoDate.optional().nullable(),
  paymentTerms: z.string().trim().max(300, 'شرایط پرداخت خیلی طولانی است.').optional().nullable(),
})
export type OrderPurchaseInput = z.infer<typeof orderPurchaseSchema>

/** ویرایش سررسید/شرایط پرداخت یک خرید — نقش‌های مالی (مسیر جداگانهٔ PATCH) */
export const purchasePaymentInfoSchema = z.object({
  dueDate: isoDate.optional().nullable(),
  paymentTerms: z.string().trim().max(300, 'شرایط پرداخت خیلی طولانی است.').optional().nullable(),
})
export type PurchasePaymentInfoInput = z.infer<typeof purchasePaymentInfoSchema>

// ─────────────────────────── مالی ساده: پرداخت و سررسید (سند سیستم یکپارچه) ───────────────────────────

export const createPaymentSchema = z.object({
  purchaseId: z.string({ message: 'خرید انتخاب‌شده معتبر نیست.' }).trim().min(1),
  amount: z.coerce
    .number({ message: 'مبلغ پرداخت را وارد کنید.' })
    .positive('مبلغ پرداخت باید بزرگ‌تر از صفر باشد.')
    .max(1_000_000_000_000, 'مبلغ وارد شده بیش از حد بزرگ است.'),
  paidAt: isoDate,
  method: z.enum(['CASH', 'TRANSFER', 'CHECK', 'OTHER'], { message: 'روش پرداخت را انتخاب کنید.' }).default('TRANSFER'),
  referenceNo: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>

export const createReceivableSchema = z.object({
  workshopId: z.string({ message: 'کارگاه را انتخاب کنید.' }).trim().min(1, 'کارگاه را انتخاب کنید.'),
  projectId: z.string().trim().optional().nullable(),
  title: z.string({ message: 'شرح طلب را وارد کنید.' }).trim().min(3, 'شرح طلب را کامل‌تر بنویسید.').max(300),
  amount: z.coerce
    .number({ message: 'مبلغ طلب را وارد کنید.' })
    .positive('مبلغ طلب باید بزرگ‌تر از صفر باشد.')
    .max(1_000_000_000_000, 'مبلغ وارد شده بیش از حد بزرگ است.'),
  dueDate: isoDate.optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})
export type CreateReceivableInput = z.infer<typeof createReceivableSchema>

export const patchReceivableSchema = z.object({
  status: z.enum(['OPEN', 'SETTLED']).optional(),
  note: z.string().trim().max(500).optional().nullable(),
})
export type PatchReceivableInput = z.infer<typeof patchReceivableSchema>

// ─────────────────────────── انبار کارگاه ───────────────────────────

export const inventoryMovementSchema = z.object({
  workshopId: z.string({ message: 'کارگاه را انتخاب کنید.' }).trim().min(1, 'کارگاه را انتخاب کنید.'),
  materialId: z.string().trim().optional().nullable(),
  materialName: z.string({ message: 'نام مصالح را وارد کنید.' }).trim().min(1, 'نام مصالح را وارد کنید.').max(200),
  unit: z.string({ message: 'واحد را انتخاب کنید.' }).trim().min(1, 'واحد را انتخاب کنید.').max(50),
  quantity: qtySchema,
  direction: z.enum(['IN', 'OUT'], { message: 'جهت گردش را انتخاب کنید.' }),
  reason: z.enum(['ISSUE', 'RETURN', 'ADJUST'], { message: 'علت گردش را انتخاب کنید.' }).default('ISSUE'),
  note: z.string().trim().max(500).optional().nullable(),
})
export type InventoryMovementInput = z.infer<typeof inventoryMovementSchema>

export const stockMinQuantitySchema = z.object({
  minQuantity: z.coerce.number().min(0, 'حداقل موجودی نمی‌تواند منفی باشد.').max(1_000_000_000).nullable(),
})

// ─────────────────────────── جابجایی نیرو ───────────────────────────

export const transferWorkerSchema = z.object({
  toWorkshopId: z.string({ message: 'کارگاه مقصد را انتخاب کنید.' }).trim().min(1, 'کارگاه مقصد را انتخاب کنید.'),
  transferredAt: isoDate,
  reason: z.string().trim().max(300).optional().nullable(),
})

// ─────────────────────────── چک‌لیست پروژه ───────────────────────────

export const checklistItemSchema = z.object({
  title: z.string({ message: 'عنوان آیتم را وارد کنید.' }).trim().min(2, 'عنوان را کامل‌تر بنویسید.').max(200),
})

export const checklistItemPatchSchema = z.object({
  title: z.string().trim().min(2, 'عنوان را کامل‌تر بنویسید.').max(200).optional(),
  isDone: z.boolean().optional(),
  note: z.string().trim().max(300).optional().nullable(),
})

// ─────────────────────────── گزارش کار کارگران ───────────────────────────

export const createWorkReportSchema = z.object({
  workshopId: z.string({ message: 'کارگاه را انتخاب کنید.' }).trim().min(1, 'کارگاه را انتخاب کنید.'),
  projectId: z.string().trim().optional().nullable(),
  workerId: z.string().trim().optional().nullable(),
  workerName: z.string({ message: 'نام کارگر را وارد کنید.' }).trim().min(2, 'نام کارگر را کامل‌تر وارد کنید.').max(120),
  reportDate: isoDate,
  content: z.string({ message: 'شرح کار را وارد کنید.' }).trim().min(3, 'شرح کار را کامل‌تر بنویسید.').max(4000),
  crewCount: z.coerce.number().int().min(0).max(500).optional().nullable(),
})
export type CreateWorkReportInput = z.infer<typeof createWorkReportSchema>

// ─────────────────────────── ارزیابی و KPI (سند سیستم یکپارچه) ───────────────────────────

export const upsertWorkerGoalSchema = z.object({
  workerId: z.string({ message: 'نیرو را انتخاب کنید.' }).trim().min(1, 'نیرو را انتخاب کنید.'),
  /** ماه هدف — قالب میلادی YYYY-MM */
  period: z
    .string({ message: 'ماه هدف را انتخاب کنید.' })
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'قالب ماه معتبر نیست.'),
  targetReports: z.coerce
    .number({ message: 'تعداد هدف را وارد کنید.' })
    .int('هدف باید عدد صحیح باشد.')
    .min(1, 'هدف باید حداقل ۱ باشد.')
    .max(1000, 'هدف بیش از حد بزرگ است.'),
  note: z.string().trim().max(300).optional().nullable(),
})
export type UpsertWorkerGoalInput = z.infer<typeof upsertWorkerGoalSchema>

// ─────────────────────────────────────────────────────────────
// Permission System — Role و Permission از هم تفکیک شده‌اند.
// منبع حقیقت: این فایل + seed به DB (برای نمایش در پنل ادمین)
// ─────────────────────────────────────────────────────────────

export const PERMISSIONS = {
  'entry.create': 'ثبت ورود مصالح',
  'entry.edit': 'ویرایش ثبت',
  'entry.submit': 'ارسال برای بررسی',
  'entry.review': 'بررسی و تأیید/رد',
  'entry.techReview': 'بررسی فنی ثبت',
  'entry.warehouse': 'تأیید انبار و تحویل',
  'entry.close': 'بستن ثبت',
  'entry.rollback': 'برگشت مرحلهٔ ثبت',
  'entry.correction.request': 'ارسال درخواست اصلاح',
  'masterdata.manage': 'مدیریت داده‌های پایه',
  'users.manage': 'مدیریت کاربران',
  'workshops.manage': 'مدیریت کارگاه‌ها',
  'projects.manage': 'مدیریت پروژه‌ها',
  'audit.view': 'مشاهده لاگ حسابرسی',
  'reports.view': 'مشاهده گزارش‌ها',
  'admin.panel': 'دسترسی پنل مدیریت',
  'task.create': 'ایجاد وظیفه روزانه',
  'task.view': 'مشاهده وظایف روزانه',
  'task.edit': 'ویرایش وظیفه روزانه',
  'task.assign': 'ارسال وظیفه به سرپرست',
  'task.complete': 'علامت‌زدن انجام وظیفه',
  'task.cancel': 'لغو وظیفه روزانه',
  'report.create': 'ثبت گزارش روزانه',
  'report.view': 'مشاهده گزارش‌های روزانه',
  'report.edit': 'ویرایش گزارش روزانه',
  'report.submit': 'ارسال گزارش روزانه',
  'report.review': 'بررسی گزارش روزانه',
  // صورت وضعیت
  'statement.view': 'مشاهده صورت وضعیت‌ها',
  'statement.create': 'ثبت صورت وضعیت',
  'statement.submit': 'ارسال صورت وضعیت برای بررسی',
  'statement.approve': 'تأیید/رد صورت وضعیت',
  'statement.gmSign': 'امضای مدیر کل',
  // اعلام نیاز و خرید
  'purchase.view': 'مشاهده درخواست‌های خرید',
  'purchase.create': 'اعلام نیاز (درخواست خرید)',
  'purchase.approve': 'تأیید/رد درخواست خرید',
  'purchase.order': 'ثبت خریداری‌شدن (تأمین‌کننده/فاکتور)',
  'purchase.receive': 'ثبت دریافت در انبار',
  // انبار کارگاه
  'inventory.view': 'مشاهده موجودی و گردش انبار',
  'inventory.manage': 'ثبت خروج/تعدیل موجودی انبار',
  // چک‌لیست پروژه
  'checklist.update': 'به‌روزرسانی چک‌لیست پروژه',
  // گزارش کار کارگران
  'workreport.view': 'مشاهده گزارش کار کارگران',
  'workreport.create': 'ثبت گزارش کار کارگر',
  'workreport.delete': 'حذف گزارش کار',
  // مالی ساده — پرداخت و سررسید (سند سیستم یکپارچه)
  'finance.view': 'مشاهده پرداخت‌ها و بدهی‌ها',
  'finance.manage': 'ثبت پرداخت و دریافت (مالی)',
  // ارزیابی و KPI
  'performance.view': 'مشاهده ارزیابی عملکرد نیروها',
  'performance.manage': 'تعیین هدف ماهانه و شرح وظایف نیرو',
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[]

export const ROLES = {
  SUPER_ADMIN: 'مدیر ارشد سیستم',
  ADMIN: 'مدیر سیستم',
  GENERAL_MANAGER: 'مدیر کل',
  PROJECT_MANAGER: 'مدیر پروژه',
  WORKSHOP_MANAGER: 'مدیر کارگاه',
  WORKSHOP_SUPERVISOR: 'سرپرست کارگاه',
  PURCHASER: 'کارپرداز / مسئول خرید',
  WAREHOUSE_MANAGER: 'انباردار',
  ACCOUNTANT: 'حسابدار / مدیر مالی',
  INSPECTOR: 'ناظر کنترل کیفیت',
  VIEWER: 'بیننده',
  FIELD_WORKER: 'نیروی اجرایی',
} as const

export type RoleKey = keyof typeof ROLES

export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  PROJECT_MANAGER: [
    'entry.review',
    'entry.close',
    'entry.rollback',
    'audit.view',
    'reports.view',
    'task.view',
    'report.view',
    'report.review',
    'statement.view',
    'statement.create',
    'statement.submit',
    'statement.approve',
    'purchase.view',
    'purchase.approve',
    'purchase.order',
    'inventory.view',
    'checklist.update',
    'workreport.view',
    'finance.view',
    'performance.view',
    'performance.manage',
  ],
  WORKSHOP_MANAGER: [
    'entry.create',
    'entry.edit',
    'entry.submit',
    'entry.review',
    'entry.techReview',
    'entry.close',
    'entry.rollback',
    'entry.correction.request',
    'audit.view',
    'reports.view',
    'task.create',
    'task.view',
    'task.edit',
    'task.assign',
    'task.cancel',
    'report.view',
    'report.review',
    'statement.view',
    'statement.create',
    'statement.submit',
    'statement.approve',
    'purchase.view',
    'purchase.create',
    'purchase.approve',
    'purchase.order',
    'inventory.view',
    'checklist.update',
    'workreport.view',
    'workreport.create',
    'workreport.delete',
    'performance.view',
    'performance.manage',
  ],
  WAREHOUSE_MANAGER: [
    'entry.warehouse',
    'reports.view',
    'audit.view',
    'statement.view',
    'purchase.view',
    'purchase.create',
    'purchase.receive',
    'inventory.view',
    'inventory.manage',
    'workreport.view',
  ],
  PURCHASER: [
    'purchase.view',
    'purchase.order',
    'inventory.view',
    'reports.view',
  ],
  ACCOUNTANT: [
    'finance.view',
    'finance.manage',
    'purchase.view',
    'inventory.view',
    'reports.view',
    'statement.view',
    'audit.view',
    'performance.view',
  ],
  INSPECTOR: [
    'entry.techReview',
    'reports.view',
    'audit.view',
    'task.view',
    'report.view',
    'statement.view',
    'purchase.view',
    'workreport.view',
  ],
  VIEWER: [
    'reports.view',
    'task.view',
    'report.view',
    'statement.view',
    'purchase.view',
    'workreport.view',
  ],
  GENERAL_MANAGER: [
    'statement.view',
    'statement.gmSign',
    'purchase.view',
    'workreport.view',
    'reports.view',
    'task.view',
    'report.view',
    'audit.view',
    'inventory.view',
    'finance.view',
    'finance.manage',
    'performance.view',
  ],
  WORKSHOP_SUPERVISOR: [
    'entry.create',
    'entry.edit',
    'entry.submit',
    'entry.correction.request',
    'audit.view',
    'reports.view',
    'task.view',
    'task.complete',
    'report.create',
    'report.edit',
    'report.submit',
    'report.view',
    'statement.view',
    'statement.create',
    'statement.submit',
    'purchase.view',
    'purchase.create',
    'inventory.view',
    'workreport.view',
    'workreport.create',
  ],
  FIELD_WORKER: [
    'workreport.view',
    'workreport.create',
  ],
}

export function hasPermission(role: string, permission: PermissionKey): boolean {
  const list = ROLE_PERMISSIONS[role as RoleKey]
  if (!list) return false
  return list.includes(permission)
}

// ─────────────────────────── سایر ثابت‌های دامنه ───────────────────────────

export const ENTRY_TYPES = {
  PURCHASE: 'خرید',
  TRANSFER: 'انتقال از کارگاه دیگر',
  LOAN: 'امانت از کارگاه دیگر',
  RETURN: 'برگشت',
  OTHER: 'سایر',
} as const
export type EntryTypeKey = keyof typeof ENTRY_TYPES

export const SOURCE_TYPES = {
  SUPPLIER: 'تأمین‌کننده',
  WORKSHOP: 'کارگاه دیگر',
  OTHER: 'سایر',
} as const
export type SourceTypeKey = keyof typeof SOURCE_TYPES

export const ENTRY_STATUSES = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ارسال‌شده',
  PENDING_REVIEW: 'در انتظار بررسی',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
  CORRECTION_REQUESTED: 'نیازمند اصلاح',
  RESUBMITTED: 'ارسال مجدد',
  LOCKED: 'قفل شده',
} as const
export type EntryStatusKey = keyof typeof ENTRY_STATUSES

export const WORKER_KINDS = {
  LABORER: 'کارگر',
  DRIVER: 'راننده',
  FORKLIFT: 'اپراتور لیفتراک',
  CONTRACTOR: 'پیمانکار',
  OTHER: 'سایر',
} as const
export type WorkerKindKey = keyof typeof WORKER_KINDS

export const ATTACHMENT_KINDS = {
  INVOICE: 'فاکتور',
  WAYBILL: 'بارنامه',
  RECEIPT: 'رسید',
  OTHER: 'سایر مدارک',
} as const
export type AttachmentKindKey = keyof typeof ATTACHMENT_KINDS

// رنگ وضعیت‌ها — طبق سند طراحی (کلاس‌های Tailwind)
export const STATUS_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  DRAFT: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-200', dot: 'bg-zinc-400', label: 'پیش‌نویس' },
  SUBMITTED: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-600', label: 'ارسال‌شده' },
  PENDING_REVIEW: { badge: 'bg-yellow-50 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500', label: 'در انتظار بررسی' },
  APPROVED: { badge: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-600', label: 'تأیید شده' },
  REJECTED: { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-600', label: 'رد شده' },
  CORRECTION_REQUESTED: { badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', label: 'نیازمند اصلاح' },
  RESUBMITTED: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-600', label: 'ارسال مجدد' },
  LOCKED: { badge: 'bg-zinc-800 text-zinc-100 border-zinc-800', dot: 'bg-zinc-800', label: 'قفل شده' },
  // زنجیرهٔ حرفه‌ای Enterprise
  TECH_REVIEW: { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-600', label: 'در بررسی فنی' },
  TECH_REVIEWED: { badge: 'bg-violet-50 text-violet-700 border-violet-300', dot: 'bg-violet-500', label: 'بررسی فنی شد' },
  WAREHOUSE_CONFIRMED: { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-600', label: 'تأیید انبار' },
  DELIVERED: { badge: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-600', label: 'تحویل شده' },
  CLOSED: { badge: 'bg-zinc-800 text-zinc-100 border-zinc-800', dot: 'bg-zinc-800', label: 'بسته شده' },
}

// ─────────────────────────── ماژول وظایف و گزارش روزانه ───────────────────────────

export const TASK_STATUSES = {
  DRAFT: 'پیش‌نویس',
  PENDING: 'در انتظار انجام',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'انجام شده',
  CANCELLED: 'لغو شده',
} as const
export type TaskStatusKey = keyof typeof TASK_STATUSES

export const TASK_PRIORITIES = {
  LOW: 'کم',
  MEDIUM: 'متوسط',
  HIGH: 'زیاد',
  URGENT: 'فوری',
} as const
export type TaskPriorityKey = keyof typeof TASK_PRIORITIES

export const TASK_PRIORITY_STYLES: Record<TaskPriorityKey, string> = {
  LOW: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  URGENT: 'bg-red-50 text-red-700 border-red-200',
}

export const TASK_STATUS_STYLES: Record<TaskStatusKey, { badge: string; dot: string; label: string }> = {
  DRAFT: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-200', dot: 'bg-zinc-400', label: 'پیش‌نویس' },
  PENDING: { badge: 'bg-yellow-50 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500', label: 'در انتظار انجام' },
  IN_PROGRESS: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-600', label: 'در حال انجام' },
  COMPLETED: { badge: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-600', label: 'انجام شده' },
  CANCELLED: { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-600', label: 'لغو شده' },
}

export const REPORT_STATUSES = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ارسال‌شده',
  REVIEWED: 'بررسی‌شده',
} as const
export type ReportStatusKey = keyof typeof REPORT_STATUSES

export const REPORT_STATUS_STYLES: Record<ReportStatusKey, { badge: string; dot: string; label: string }> = {
  DRAFT: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-200', dot: 'bg-zinc-400', label: 'پیش‌نویس' },
  SUBMITTED: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-600', label: 'ارسال‌شده' },
  REVIEWED: { badge: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-600', label: 'بررسی‌شده' },
}

export const TASK_SOURCE_TYPES = {
  MANUAL: 'دستی',
} as const

// ─────────────────────────── صورت وضعیت ───────────────────────────

/** آستانهٔ امضای مدیر کل — صورت وضعیت‌های بالای این مبلغ (تومان) نیازمند امضای مدیر کل‌اند */
export const GM_SIGN_THRESHOLD_TOMAN = 150_000_000

export const STATEMENT_STATUSES = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ارسال‌شده — در انتظار بررسی',
  APPROVED: 'تأیید شده',
  PENDING_GM_SIGN: 'در انتظار امضای مدیر کل',
  SIGNED: 'امضاشده توسط مدیر کل',
  REJECTED: 'رد شده',
} as const
export type StatementStatusKey = keyof typeof STATEMENT_STATUSES

export const STATEMENT_STATUS_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  DRAFT: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-200', dot: 'bg-zinc-400', label: 'پیش‌نویس' },
  SUBMITTED: { badge: 'bg-yellow-50 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500', label: 'در انتظار بررسی' },
  APPROVED: { badge: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-600', label: 'تأیید شده' },
  PENDING_GM_SIGN: { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-600', label: 'در انتظار امضای مدیر کل' },
  SIGNED: { badge: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-600', label: 'امضاشده — نهایی' },
  REJECTED: { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-600', label: 'رد شده' },
}

// ─────────────────────────── اعلام نیاز و کنترل خرید ───────────────────────────

export const PURCHASE_STATUSES = {
  PENDING: 'در انتظار تأیید',
  APPROVED: 'تأیید شده — آماده خرید',
  ORDERED: 'خریداری شد',
  RECEIVED: 'دریافت در انبار',
  REJECTED: 'رد شده',
} as const
export type PurchaseStatusKey = keyof typeof PURCHASE_STATUSES

export const PURCHASE_STATUS_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  PENDING: { badge: 'bg-yellow-50 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500', label: 'در انتظار تأیید' },
  APPROVED: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-600', label: 'تأیید شده' },
  ORDERED: { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-600', label: 'خریداری شد' },
  RECEIVED: { badge: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-600', label: 'دریافت شد' },
  REJECTED: { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-600', label: 'رد شده' },
}

// ─────────────────────────── انبار کارگاه ───────────────────────────

export const INVENTORY_DIRECTIONS = {
  IN: 'ورود',
  OUT: 'خروج',
} as const

export const INVENTORY_REASONS = {
  PURCHASE: 'دریافت خرید',
  ENTRY: 'ورود مصالح',
  ISSUE: 'مصرف / تحویل به کارگاه',
  RETURN: 'برگشت به انبار',
  ADJUST: 'تعدیل موجودی',
} as const
export type InventoryReasonKey = keyof typeof INVENTORY_REASONS

// ─────────────────────────── مالی ساده: پرداخت و سررسید (سند سیستم یکپارچه) ───────────────────────────

export const PAYMENT_METHODS = {
  CASH: 'نقدی',
  TRANSFER: 'کارت به کارت / حواله',
  CHECK: 'چک',
  OTHER: 'سایر',
} as const
export type PaymentMethodKey = keyof typeof PAYMENT_METHODS

/** وضعیت بدهی یک خرید — بر اساس مجموع پرداخت‌ها نسبت به مبلغ کل */
export const PURCHASE_PAYMENT_STATUSES = {
  UNPAID: 'پرداخت‌نشده',
  PARTIAL: 'پرداخت جزئی',
  PAID: 'تسویه شده',
} as const
export type PurchasePaymentStatusKey = keyof typeof PURCHASE_PAYMENT_STATUSES

export const RECEIVABLE_STATUSES = {
  OPEN: 'باز',
  SETTLED: 'وصول شده',
} as const
export type ReceivableStatusKey = keyof typeof RECEIVABLE_STATUSES

export const RECEIVABLE_STATUS_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  OPEN: { badge: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', label: 'باز' },
  SETTLED: { badge: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-600', label: 'وصول شده' },
}

/** آیا خرید سررسید گذشته و پرداخت‌نشده است؟ */
export function isPurchaseOverdue(dueDate: Date | string | null | undefined, remaining: number): boolean {
  if (!dueDate || remaining <= 0) return false
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  if (isNaN(d.getTime())) return false
  // سررسید = نیمه‌شب؛ از ابتدای روزِ بعدِ سررسید «عقب‌افتاده» حساب می‌شود
  const endOfDueDay = new Date(d)
  endOfDueDay.setHours(23, 59, 59, 999)
  return endOfDueDay.getTime() < Date.now()
}

// ─────────────────────────── زنجیرهٔ حرفه‌ای Workflow ثبت ───────────────────────────
// مسیر کامل: DRAFT → SUBMITTED → TECH_REVIEW → TECH_REVIEWED → APPROVED →
// WAREHOUSE_CONFIRMED → DELIVERED → CLOSED
// عبور مستقیم از PENDING_REVIEW به APPROVED (بدون بررسی فنی) مجاز است — سازگار با جریان فعلی.

export const ENTRY_STAGE_CHAIN = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_REVIEW',
  'TECH_REVIEW',
  'TECH_REVIEWED',
  'APPROVED',
  'WAREHOUSE_CONFIRMED',
  'DELIVERED',
  'CLOSED',
] as const

export const ENTRY_STAGE_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ارسال‌شده',
  PENDING_REVIEW: 'در انتظار بررسی مدیر',
  TECH_REVIEW: 'در بررسی فنی',
  TECH_REVIEWED: 'بررسی فنی شد',
  APPROVED: 'تأیید مدیر',
  WAREHOUSE_CONFIRMED: 'تأیید انبار',
  DELIVERED: 'تحویل شده',
  CLOSED: 'بسته شده',
  REJECTED: 'رد شده',
  CORRECTION_REQUESTED: 'نیازمند اصلاح',
  RESUBMITTED: 'ارسال مجدد',
  LOCKED: 'قفل شده',
}

export const ENTRY_STAGE_STYLES: Record<string, { badge: string; dot: string }> = {
  TECH_REVIEW: { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-600' },
  TECH_REVIEWED: { badge: 'bg-violet-50 text-violet-700 border-violet-300', dot: 'bg-violet-500' },
  WAREHOUSE_CONFIRMED: { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-600' },
  DELIVERED: { badge: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-600' },
  CLOSED: { badge: 'bg-zinc-800 text-zinc-100 border-zinc-800', dot: 'bg-zinc-800' },
}

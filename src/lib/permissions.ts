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
  'voice.upload': 'بارگذاری فایل صوتی',
  'voice.transcribe': 'تبدیل صوت به متن',
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[]

export const ROLES = {
  SUPER_ADMIN: 'مدیر ارشد سیستم',
  ADMIN: 'مدیر سیستم',
  PROJECT_MANAGER: 'مدیر پروژه',
  WORKSHOP_MANAGER: 'مدیر کارگاه',
  WORKSHOP_SUPERVISOR: 'سرپرست کارگاه',
  WAREHOUSE_MANAGER: 'انباردار',
  INSPECTOR: 'ناظر کنترل کیفیت',
  VIEWER: 'بیننده',
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
    'voice.upload',
    'voice.transcribe',
  ],
  WAREHOUSE_MANAGER: [
    'entry.warehouse',
    'reports.view',
    'audit.view',
  ],
  INSPECTOR: [
    'entry.techReview',
    'reports.view',
    'audit.view',
    'task.view',
    'report.view',
  ],
  VIEWER: [
    'reports.view',
    'task.view',
    'report.view',
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
    'voice.upload',
    'voice.transcribe',
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
  VOICE: 'صوتی',
} as const

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

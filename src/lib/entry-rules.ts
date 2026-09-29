import type { MaterialEntry } from '@prisma/client'

// ─────────────────────────── State Machine ثبت ورود ───────────────────────────
// منبع حقیقت قوانین وضعیت — تک نقطه اعمال در API و Business Layer

export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000 // ۲۴ ساعت

export const ENTRY_EDITABLE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_REVIEW',
  'APPROVED',
  'CORRECTION_REQUESTED',
] as const

/** وضعیت‌های پس از تأیید که هنوز در زنجیرهٔ انبار/تحویل/بستن پیش می‌روند */
export const POST_APPROVAL_STATUSES = ['APPROVED', 'WAREHOUSE_CONFIRMED', 'DELIVERED', 'CLOSED'] as const

/**
 * زنجیرهٔ حرفه‌ای: برای هر وضعیت، مجموعهٔ وضعیت‌های مجاز بعدی.
 * منبع یگانهٔ حقیقت انتقال‌ها — سمت سرور اعمال می‌شود.
 */
export const STAGE_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['PENDING_REVIEW', 'TECH_REVIEW', 'APPROVED', 'REJECTED', 'CORRECTION_REQUESTED'],
  PENDING_REVIEW: ['TECH_REVIEW', 'APPROVED', 'REJECTED', 'CORRECTION_REQUESTED'],
  RESUBMITTED: ['TECH_REVIEW', 'APPROVED', 'REJECTED', 'CORRECTION_REQUESTED'],
  TECH_REVIEW: ['TECH_REVIEWED', 'REJECTED'],
  TECH_REVIEWED: ['APPROVED', 'REJECTED'],
  APPROVED: ['WAREHOUSE_CONFIRMED'],
  LOCKED: ['WAREHOUSE_CONFIRMED'], // قفل ۲۴ ساعته مانع ادامهٔ زنجیرهٔ انبار نیست
  WAREHOUSE_CONFIRMED: ['DELIVERED'],
  DELIVERED: ['CLOSED'],
  CLOSED: [],
  REJECTED: [],
  CORRECTION_REQUESTED: ['RESUBMITTED'],
}

/**
 * آیا رکورد قفل شده است؟ — مبنای قفل فقط Server Timestamp است.
 * رکورد بدون submit همیشه قابل ویرایش است (پیش‌نویس).
 */
export function isLocked(entry: Pick<MaterialEntry, 'status' | 'submittedAt' | 'editDeadline' | 'lockedAt'>, now = new Date()): boolean {
  if (entry.status === 'LOCKED') return true
  if (!entry.submittedAt) return false
  return now.getTime() - entry.submittedAt.getTime() > EDIT_WINDOW_MS
}

/**
 * آیا ویرایش مستقیم مجاز است؟
 * - DRAFT: همیشه
 * - سایر وضعیت‌های قابل ویرایش: فقط تا ۲۴ ساعت پس از ثبت واقعی روی سرور
 * - REJECTED/LOCKED: ویرایش مستقیم ممنوع
 */
export function canDirectEdit(entry: Pick<MaterialEntry, 'status' | 'submittedAt' | 'editDeadline' | 'lockedAt'>, now = new Date()): boolean {
  if (entry.status === 'REJECTED' || entry.status === 'LOCKED') return false
  if (entry.status === 'DRAFT' && !entry.submittedAt) return true
  if (!ENTRY_EDITABLE_STATUSES.includes(entry.status as (typeof ENTRY_EDITABLE_STATUSES)[number])) return false
  if (!entry.submittedAt) return true
  return now.getTime() - entry.submittedAt.getTime() <= EDIT_WINDOW_MS
}

/**
 * آیا فقط درخواست اصلاح ممکن است؟ (بعد از قفل)
 */
export function canRequestCorrection(entry: Pick<MaterialEntry, 'status' | 'submittedAt' | 'editDeadline' | 'lockedAt'>, now = new Date()): boolean {
  if (entry.status === 'LOCKED') return true
  if (!entry.submittedAt) return false
  return (
    isLocked(entry, now) &&
    ['APPROVED', 'REJECTED'].includes(entry.status)
  )
}

/**
 * آیا می‌تواند Resubmit کند؟ (مسیر اصلاح خواسته مدیر)
 */
export function canResubmit(entry: Pick<MaterialEntry, 'status'>): boolean {
  return ['CORRECTION_REQUESTED', 'DRAFT'].includes(entry.status)
}

/**
 * آیا مدیر می‌تواند بررسی انجام دهد؟
 * بررسی فنی‌شده هم آمادهٔ تأیید مدیر است.
 */
export function canReview(entry: Pick<MaterialEntry, 'status'>): boolean {
  return ['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED', 'TECH_REVIEWED'].includes(entry.status)
}

/** آیا ناظر می‌تواند بررسی فنی را شروع کند؟ */
export function canStartTechReview(entry: Pick<MaterialEntry, 'status'>): boolean {
  return ['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED'].includes(entry.status)
}

/** آیا مرحلهٔ تأیید انبار انجام‌شدنی است؟ */
export function canWarehouseConfirm(entry: Pick<MaterialEntry, 'status'>): boolean {
  return ['APPROVED', 'LOCKED'].includes(entry.status)
}

/** آیا مرحلهٔ تحویل انجام‌شدنی است؟ */
export function canDeliver(entry: Pick<MaterialEntry, 'status'>): boolean {
  return entry.status === 'WAREHOUSE_CONFIRMED'
}

/** آیا بستن ثبت مجاز است؟ */
export function canClose(entry: Pick<MaterialEntry, 'status'>): boolean {
  return entry.status === 'DELIVERED'
}

/** مهلت ویرایش: submittedAt + 24h (روی سرور محاسبه می‌شود) */
export function computeEditDeadline(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + EDIT_WINDOW_MS)
}

/** توضیح وضعیت برای کاربر */
export function statusHint(entry: Pick<MaterialEntry, 'status' | 'submittedAt' | 'editDeadline' | 'lockedAt'>, now = new Date()): string {
  if (entry.status === 'REJECTED') return 'این ثبت رد شده است. برای ثبت مجدد، یک ثبت جدید ایجاد کنید.'
  if (isLocked(entry, now)) {
    return 'مهلت ویرایش به پایان رسیده است. در صورت نیاز، درخواست اصلاح برای مدیر ارسال کنید.'
  }
  if (entry.status === 'DRAFT') return 'این ثبت هنوز ارسال نشده است.'
  if (entry.status === 'CORRECTION_REQUESTED') return 'مدیر اصلاح خواسته است. پس از ویرایش، دوباره ارسال کنید.'
  return 'در مهلت ۲۴ ساعت قابل ویرایش است.'
}

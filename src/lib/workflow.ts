import { db } from '@/lib/db'
import type { MaterialEntry, Prisma } from '@prisma/client'
import type { SessionUser } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { ApiError } from '@/lib/api'
import { logger, safeErrorMeta } from '@/lib/logger'
import {
  canDirectEdit,
  canReview,
  canResubmit,
  canRequestCorrection,
  canStartTechReview,
  canWarehouseConfirm,
  canDeliver,
  canClose,
  computeEditDeadline,
  isLocked,
} from '@/lib/entry-rules'
import { ENTRY_STAGE_LABELS } from '@/lib/permissions'
import { dispatchForNotificationRow } from '@/lib/notify-channels'
import { applyEntryStockIn } from '@/lib/inventory'

// ─────────────────────────── تاریخچهٔ مراحل (Stage Log) ───────────────────────────

interface StageLogInput {
  entryId: string
  stage: string
  action: string
  actorId: string
  note?: string | null
}

/** ثبت یک رکورد تاریخچهٔ مرحله — خارج از تراکنش اصلی؛ هرگز جریان اصلی را نمی‌شکند */
async function logStage(input: StageLogInput): Promise<void> {
  try {
    await db.entryStageLog.create({
      data: {
        entryId: input.entryId,
        stage: input.stage,
        action: input.action,
        actorId: input.actorId,
        note: input.note ?? null,
      },
    })
  } catch (err) {
    logger.error('workflow', 'stage log failed', safeErrorMeta(err))
  }
}

// ─────────────────────────── زنجیرهٔ حرفه‌ای Workflow ───────────────────────────
// DRAFT → SUBMITTED → TECH_REVIEW → TECH_REVIEWED → APPROVED →
// WAREHOUSE_CONFIRMED → DELIVERED → CLOSED (+ مسیرهای رد/اصلاح)

/** شروع بررسی فنی توسط ناظر/مدیر */
export async function startTechReview(entry: MaterialEntry, user: SessionUser, ip: string, ua: string): Promise<MaterialEntry> {
  if (!canStartTechReview(entry)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'این ثبت در وضعیت فعلی آمادهٔ بررسی فنی نیست.')
  }
  const now = new Date()
  const updated = await db.materialEntry.update({
    where: { id: entry.id },
    data: { status: 'TECH_REVIEW', techReviewStartedAt: now },
  })
  await logStage({ entryId: entry.id, stage: 'TECH_REVIEW', action: 'TECH_REVIEW_START', actorId: user.id })
  await writeAudit({ user, action: 'TECH_REVIEW_START', entityType: 'MaterialEntry', entityId: entry.id, oldValue: { status: entry.status }, newValue: { status: 'TECH_REVIEW' }, ip, userAgent: ua })
  await notifyUser(entry.supervisorId, 'ENTRY_STAGE', 'بررسی فنی آغاز شد', `بررسی فنی ثبت «${ENTRY_STAGE_LABELS.TECH_REVIEW}» در جریان است.`, entry.id)
  return updated
}

/** پایان بررسی فنی با نظر ناظر — ثبت آمادهٔ تأیید مدیر می‌شود */
export async function completeTechReview(entry: MaterialEntry, user: SessionUser, note: string | null, ip: string, ua: string): Promise<MaterialEntry> {
  if (entry.status !== 'TECH_REVIEW') {
    throw new ApiError(409, 'INVALID_TRANSITION', 'بررسی فنی برای این ثبت آغاز نشده است.')
  }
  const now = new Date()
  const updated = await db.materialEntry.update({
    where: { id: entry.id },
    data: {
      status: 'TECH_REVIEWED',
      techReviewedAt: now,
      techReviewedById: user.id,
      techReviewNote: note,
    },
  })
  await logStage({ entryId: entry.id, stage: 'TECH_REVIEWED', action: 'TECH_REVIEW_COMPLETE', actorId: user.id, note })
  await writeAudit({ user, action: 'TECH_REVIEW_COMPLETE', entityType: 'MaterialEntry', entityId: entry.id, oldValue: { status: entry.status }, newValue: { status: 'TECH_REVIEWED' }, reason: note, ip, userAgent: ua })
  await notifyManagersOfEntry(entry, 'بررسی فنی انجام شد', 'ناظر بررسی فنی را کامل کرد؛ ثبت آمادهٔ تأیید شماست.', 'ENTRY_TECH_REVIEWED')
  return updated
}

/** تأیید انبار — رزرو/اعلام موجودی توسط انباردار */
export async function warehouseConfirm(entry: MaterialEntry, user: SessionUser, note: string | null, ip: string, ua: string): Promise<MaterialEntry> {
  if (!canWarehouseConfirm(entry)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'تأیید انبار فقط پس از تأیید مدیر امکان‌پذیر است.')
  }
  const now = new Date()
  const updated = await db.materialEntry.update({
    where: { id: entry.id },
    data: { status: 'WAREHOUSE_CONFIRMED', warehouseConfirmedAt: now, warehouseConfirmedById: user.id },
  })
  await logStage({ entryId: entry.id, stage: 'WAREHOUSE_CONFIRMED', action: 'WAREHOUSE_CONFIRM', actorId: user.id, note })
  await writeAudit({ user, action: 'WAREHOUSE_CONFIRM', entityType: 'MaterialEntry', entityId: entry.id, oldValue: { status: entry.status }, newValue: { status: 'WAREHOUSE_CONFIRMED' }, reason: note, ip, userAgent: ua })
  await notifyUser(entry.supervisorId, 'ENTRY_STAGE', 'انبار تأیید کرد', 'تأیید انبار انجام شد؛ آمادهٔ تحویل است.', entry.id)

  // ورود خودکار اقلام به موجودی انبار کارگاه — ضدتکرار و ضدخطا (جریان اصلی را شکست نمی‌دهد)
  try {
    const full = await db.materialEntry.findUnique({
      where: { id: entry.id },
      select: { id: true, workshopId: true, inventoryAppliedAt: true, items: { select: { materialId: true, materialName: true, quantity: true, unit: true } } },
    })
    if (full) await applyEntryStockIn(full, user.id)
  } catch {
    // انبار اختیاری است — هرگز مسیر اصلی را شکست نمی‌دهد
  }
  return updated
}

/** تحویل مصالح به کارگاه */
export async function deliverEntry(entry: MaterialEntry, user: SessionUser, note: string | null, ip: string, ua: string): Promise<MaterialEntry> {
  if (!canDeliver(entry)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'تحویل فقط پس از تأیید انبار امکان‌پذیر است.')
  }
  const now = new Date()
  const updated = await db.materialEntry.update({
    where: { id: entry.id },
    data: { status: 'DELIVERED', deliveredAt: now, deliveredById: user.id },
  })
  await logStage({ entryId: entry.id, stage: 'DELIVERED', action: 'DELIVER', actorId: user.id, note })
  await writeAudit({ user, action: 'DELIVER', entityType: 'MaterialEntry', entityId: entry.id, oldValue: { status: entry.status }, newValue: { status: 'DELIVERED' }, reason: note, ip, userAgent: ua })
  await notifyUser(entry.supervisorId, 'ENTRY_STAGE', 'مصالح تحویل شد', 'مصالح به کارگاه تحویل داده شد.', entry.id)
  return updated
}

/** بستن ثبت — پایان زنجیره؛ دیگر برگشتی نیست مگر با Rollback */
export async function closeEntry(entry: MaterialEntry, user: SessionUser, note: string | null, ip: string, ua: string): Promise<MaterialEntry> {
  if (!canClose(entry)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'بستن ثبت فقط پس از تحویل امکان‌پذیر است.')
  }
  const now = new Date()
  const updated = await db.materialEntry.update({
    where: { id: entry.id },
    data: { status: 'CLOSED', closedAt: now, closedById: user.id },
  })
  await logStage({ entryId: entry.id, stage: 'CLOSED', action: 'CLOSE', actorId: user.id, note })
  await writeAudit({ user, action: 'CLOSE', entityType: 'MaterialEntry', entityId: entry.id, oldValue: { status: entry.status }, newValue: { status: 'CLOSED' }, reason: note, ip, userAgent: ua })
  await notifyUser(entry.supervisorId, 'ENTRY_STAGE', 'ثبت بسته شد', 'فرایند ثبت با موفقیت کامل و بسته شد.', entry.id)
  return updated
}

// ─────────────────────────── برگشت مرحله (Rollback) ───────────────────────────

/**
 * نقشهٔ برگشت: هر مرحله به مرحلهٔ قبلی — با پاک‌سازی مهر زمانی همان مرحله.
 * برگشت یعنی «اصلاح تصمیم»؛ تاریخچهٔ حذف نمی‌شود (StageLog با Action=ROLLBACK ثبت می‌شود).
 */
const ROLLBACK_MAP: Record<string, { to: string; clear: Prisma.MaterialEntryUpdateInput }> = {
  CLOSED: { to: 'DELIVERED', clear: { closedAt: null, closedById: null } },
  DELIVERED: { to: 'WAREHOUSE_CONFIRMED', clear: { deliveredAt: null, deliveredById: null } },
  WAREHOUSE_CONFIRMED: { to: 'APPROVED', clear: { warehouseConfirmedAt: null, warehouseConfirmedById: null } },
  APPROVED: {
    to: 'TECH_REVIEWED', // در مسیر کامل به بررسی فنی برمی‌گردد؛ اگر بررسی فنی نشده بود زیرش بررسی می‌شود
    clear: { decidedAt: null, approvedById: null, decisionNote: null },
  },
  TECH_REVIEWED: { to: 'PENDING_REVIEW', clear: { techReviewedAt: null, techReviewedById: null, techReviewNote: null } },
  TECH_REVIEW: { to: 'PENDING_REVIEW', clear: { techReviewStartedAt: null } },
}

/**
 * برگشت ثبت به مرحلهٔ قبلی — فقط با مجوز entry.rollback (مدیر پروژه/کارگاه/ادمین).
 * برای ثبتِ بررسی‌فنی‌نشده، برگشت APPROVED به PENDING_REVIEW است.
 */
export async function rollbackStage(entry: MaterialEntry, user: SessionUser, reason: string | null, ip: string, ua: string): Promise<MaterialEntry> {
  const rule = ROLLBACK_MAP[entry.status]
  if (!rule) {
    throw new ApiError(409, 'INVALID_TRANSITION', `برگشت مرحله برای وضعیت «${ENTRY_STAGE_LABELS[entry.status] ?? entry.status}» امکان‌پذیر نیست.`)
  }
  const to = entry.status === 'APPROVED' && !entry.techReviewedAt ? 'PENDING_REVIEW' : rule.to
  const updated = await db.materialEntry.update({
    where: { id: entry.id },
    data: { status: to, ...rule.clear },
  })
  await logStage({ entryId: entry.id, stage: to, action: 'ROLLBACK', actorId: user.id, note: reason })
  await writeAudit({ user, action: 'ROLLBACK', entityType: 'MaterialEntry', entityId: entry.id, oldValue: { status: entry.status }, newValue: { status: to }, reason, ip, userAgent: ua })
  await notifyUser(entry.supervisorId, 'ENTRY_STAGE', 'ثبت به مرحلهٔ قبل برگشت', `ثبت به مرحلهٔ «${ENTRY_STAGE_LABELS[to] ?? to}» برگشت داده شد.`, entry.id)
  return updated
}

// ─────────────────────────── Snapshot برای Versioning ───────────────────────────

export interface EntrySnapshot {
  type: string
  sourceType: string
  sourceSupplierId: string | null
  sourceWorkshopId: string | null
  sourceDescription: string | null
  notes: string | null
  hasInvoice: boolean
  items: Array<{
    materialId: string | null
    materialName: string
    quantity: number
    unit: string
    brand: string | null
    batchNumber: string | null
    serialNumber: string | null
    description: string | null
  }>
  projects: string[]
  workers: Array<{ workerId: string | null; workerName: string; workerKind: string; role: string | null }>
}

export function buildSnapshot(
  entry: {
    type: string
    sourceType: string
    sourceSupplierId: string | null
    sourceWorkshopId: string | null
    sourceDescription: string | null
    notes: string | null
    hasInvoice: boolean
  },
  items: EntrySnapshot['items'],
  projectIds: string[],
  workers: EntrySnapshot['workers']
): EntrySnapshot {
  return {
    type: entry.type,
    sourceType: entry.sourceType,
    sourceSupplierId: entry.sourceSupplierId,
    sourceWorkshopId: entry.sourceWorkshopId,
    sourceDescription: entry.sourceDescription,
    notes: entry.notes,
    hasInvoice: entry.hasInvoice,
    items,
    projects: projectIds,
    workers,
  }
}

// ─────────────────────────── اعلان‌ها ───────────────────────────

async function notifyManagersOfEntry(entry: { id: string; workshopId: string }, title: string, body: string, type: string) {
  // مدیرانی که به پروژه‌های این ثبت دسترسی دارند یا عضو کارگاه ثبت‌کننده‌اند
  const projects = await db.materialEntryProject.findMany({ where: { entryId: entry.id }, select: { projectId: true } })
  const projectIds = projects.map((p) => p.projectId)
  const userProjects = await db.userProject.findMany({
    where: { projectId: { in: projectIds.length ? projectIds : ['__none__'] } },
    select: { userId: true },
  })
  const userWorkshops = await db.userWorkshop.findMany({
    where: { workshopId: entry.workshopId },
    select: { userId: true },
  })
  const managerRoles = ['PROJECT_MANAGER', 'WORKSHOP_MANAGER', 'ADMIN', 'SUPER_ADMIN']
  const candidates = new Set<string>([...userProjects.map((u) => u.userId), ...userWorkshops.map((u) => u.userId)])
  const managers = await db.user.findMany({
    where: { id: { in: Array.from(candidates) }, role: { in: managerRoles }, isActive: true },
    select: { id: true },
  })
  if (managers.length === 0) return
  const rows = await db.notification.createManyAndReturn({
    data: managers.map((m) => ({ userId: m.id, type, title, body, entityId: entry.id, entityType: 'MaterialEntry' })),
  })
  void Promise.allSettled(rows.map((r) => dispatchForNotificationRow(r)))
}

async function notifyUser(userId: string, type: string, title: string, body: string, entityId: string) {
  const row = await db.notification.create({
    data: { userId, type, title, body, entityId, entityType: 'MaterialEntry' },
  }).catch(() => null)
  if (row) void dispatchForNotificationRow(row)
}

// ─────────────────────────── عملیات Workflow ───────────────────────────

/** ارسال ثبت برای بررسی مدیر — SUBMITTED (از DRAFT یا CORRECTION_REQUESTED→RESUBMITTED مسیر جدا دارد) */
export async function submitEntry(entry: MaterialEntry, user: SessionUser, ip: string, ua: string): Promise<MaterialEntry> {
  if (!['DRAFT', 'SUBMITTED'].includes(entry.status)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'این ثبت در وضعیتی است که امکان ارسال مجدد ندارد.')
  }
  const now = new Date()
  const updated = await db.$transaction(async (tx) => {
    return tx.materialEntry.update({
      where: { id: entry.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: now,
        editDeadline: computeEditDeadline(now),
        decidedAt: null,
        approvedById: null,
        decisionNote: null,
      },
    })
  })
  await writeAudit({ user, action: 'SUBMIT', entityType: 'MaterialEntry', entityId: entry.id, newValue: { status: 'SUBMITTED' }, ip, userAgent: ua })
  await logStage({ entryId: entry.id, stage: 'SUBMITTED', action: 'SUBMIT', actorId: user.id })
  await notifyManagersOfEntry(entry, 'ثبت جدید دریافت شد', `یک ثبت ورود مصالح جدید برای بررسی ارسال شد.`, 'ENTRY_SUBMITTED')
  return updated
}

/** ارسال مجدد پس از اصلاح خواسته مدیر — RESUBMITTED → شمارش مجدد مهلت ۲۴ ساعت از همین لحظه */
export async function resubmitEntry(entry: MaterialEntry, user: SessionUser, ip: string, ua: string): Promise<MaterialEntry> {
  if (!canResubmit(entry)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'ارسال مجدد برای این ثبت امکان‌پذیر نیست.')
  }
  const now = new Date()
  const updated = await db.$transaction(async (tx) => {
    return tx.materialEntry.update({
      where: { id: entry.id },
      data: {
        status: 'RESUBMITTED',
        submittedAt: now,
        editDeadline: computeEditDeadline(now),
        decidedAt: null,
        approvedById: null,
        decisionNote: null,
      },
    })
  })
  await writeAudit({ user, action: 'RESUBMIT', entityType: 'MaterialEntry', entityId: entry.id, newValue: { status: 'RESUBMITTED' }, ip, userAgent: ua })
  await logStage({ entryId: entry.id, stage: 'RESUBMITTED', action: 'RESUBMIT', actorId: user.id })
  await notifyManagersOfEntry(entry, 'ثبت اصلاح‌شده دریافت شد', 'سرپرست، ثبت را پس از اصلاح دوباره ارسال کرد.', 'ENTRY_SUBMITTED')
  return updated
}

/** بررسی مدیر: تأیید / رد / درخواست اصلاح */
export async function reviewEntry(
  entry: MaterialEntry,
  user: SessionUser,
  action: 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTION',
  reason: string | null,
  ip: string,
  ua: string
): Promise<MaterialEntry> {
  if (!canReview(entry)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'این ثبت در وضعیت فعلی قابل بررسی نیست.')
  }
  const now = new Date()
  const statusMap = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_CORRECTION: 'CORRECTION_REQUESTED' } as const
  const auditMap = { APPROVE: 'APPROVE', REJECT: 'REJECT', REQUEST_CORRECTION: 'REQUEST_CORRECTION' } as const
  const notifMap = {
    APPROVE: ['ثبت شما تأیید شد', 'ثبت ورود مصالح شما توسط مدیر تأیید شد.', 'ENTRY_APPROVED'],
    REJECT: ['ثبت شما رد شد', reason ?? 'ثبت ورود مصالح شما توسط مدیر رد شد.', 'ENTRY_REJECTED'],
    REQUEST_CORRECTION: ['نیازمند اصلاح', reason ?? 'مدیر برای ثبت شما اصلاح خواسته است.', 'CORRECTION_REQUESTED'],
  } as const

  const updated = await db.$transaction(async (tx) => {
    await tx.approval.create({
      data: { entryId: entry.id, action, decidedById: user.id, reason, decidedAt: now },
    })
    return tx.materialEntry.update({
      where: { id: entry.id },
      data: { status: statusMap[action], decidedAt: now, approvedById: user.id, decisionNote: reason },
    })
  })
  await writeAudit({ user, action: auditMap[action], entityType: 'MaterialEntry', entityId: entry.id, oldValue: { status: entry.status }, newValue: { status: statusMap[action] }, reason, ip, userAgent: ua })
  await logStage({ entryId: entry.id, stage: statusMap[action], action: auditMap[action], actorId: user.id, note: reason })
  await notifyUser(entry.supervisorId, notifMap[action][2], notifMap[action][0], notifMap[action][1], entry.id)
  return updated
}

/**
 * ویرایش محتوای ثبت (در مهلت مجاز) — اگر ثبت قبلاً SUBMITTED/APPROVED بوده باشد، نسخه جدید ساخته می‌شود.
 * تمام تغییرات (رکورد + روابط + نسخه) در یک تراکنش اتمی انجام می‌شود.
 */
export async function editEntryWithVersion(
  entry: MaterialEntry,
  newSnapshot: EntrySnapshot,
  data: Prisma.MaterialEntryUpdateInput,
  replaceRelations: (tx: Prisma.TransactionClient) => Promise<void>,
  user: SessionUser,
  changeReason: string | null,
  ip: string,
  ua: string
): Promise<MaterialEntry> {
  if (!canDirectEdit(entry)) {
    if (isLocked(entry)) {
      throw new ApiError(423, 'ENTRY_LOCKED', 'مهلت ویرایش این ثبت به پایان رسیده است. می‌توانید درخواست اصلاح برای مدیر ارسال کنید.')
    }
    throw new ApiError(409, 'ENTRY_NOT_EDITABLE', 'این ثبت در وضعیت فعلی قابل ویرایش نیست.')
  }

  const wasSubmitted = entry.submittedAt !== null

  const updated = await db.$transaction(async (tx) => {
    await replaceRelations(tx)
    if (wasSubmitted) {
      await tx.materialEntryVersion.create({
        data: {
          entryId: entry.id,
          version: entry.currentVersion + 1,
          snapshotJson: JSON.stringify(newSnapshot),
          changeReason,
          changedById: user.id,
        },
      })
    }
    return tx.materialEntry.update({
      where: { id: entry.id },
      data: wasSubmitted ? { ...data, currentVersion: entry.currentVersion + 1 } : data,
    })
  })

  await writeAudit({
    user,
    action: 'EDIT',
    entityType: 'MaterialEntry',
    entityId: entry.id,
    oldValue: undefined,
    newValue: newSnapshot,
    reason: changeReason,
    ip,
    userAgent: ua,
  })
  return updated
}

/** ثبت درخواست اصلاح توسط سرپرست (پس از قفل) */
export async function createCorrectionRequest(
  entry: MaterialEntry,
  user: SessionUser,
  reason: string,
  ip: string,
  ua: string
) {
  if (!canRequestCorrection(entry)) {
    throw new ApiError(409, 'NOT_LOCKED', 'این ثبت هنوز قفل نشده است؛ در صورت نیاز آن را ویرایش کنید.')
  }
  const cr = await db.$transaction(async (tx) => {
    return tx.correctionRequest.create({
      data: { entryId: entry.id, requestedById: user.id, reason, status: 'PENDING' },
    })
  })
  await writeAudit({ user, action: 'REQUEST_CORRECTION', entityType: 'MaterialEntry', entityId: entry.id, reason, ip, userAgent: ua })
  await notifyManagersOfEntry(entry, 'درخواست اصلاح جدید', `سرپرست درخواست اصلاح ثبت کرد: ${reason}`, 'NEW_CORRECTION_REQUEST')
  return cr
}

/** بررسی درخواست اصلاح توسط مدیر — در صورت تأیید، نسخه جدیدی از رکورد ایجاد می‌شود */
export async function reviewCorrectionRequest(
  crId: string,
  user: SessionUser,
  decision: 'APPROVED' | 'REJECTED',
  responseNote: string | null,
  ip: string,
  ua: string
) {
  const cr = await db.correctionRequest.findUnique({ where: { id: crId }, include: { entry: true } })
  if (!cr) throw new ApiError(404, 'NOT_FOUND', 'درخواست اصلاح پیدا نشد.')
  if (cr.status !== 'PENDING') throw new ApiError(409, 'ALREADY_REVIEWED', 'این درخواست قبلاً بررسی شده است.')

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.correctionRequest.update({
      where: { id: crId },
      data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), responseNote },
    })
    if (decision === 'APPROVED') {
      await tx.approval.create({
        data: { entryId: cr.entryId, action: 'APPROVE_CORRECTION', decidedById: user.id, reason: responseNote ?? cr.reason },
      })
    }
    return res
  })

  await writeAudit({
    user,
    action: decision === 'APPROVED' ? 'APPROVE_CORRECTION' : 'REJECT_CORRECTION',
    entityType: 'CorrectionRequest',
    entityId: crId,
    newValue: { status: decision },
    reason: responseNote,
    ip,
    userAgent: ua,
  })
  await notifyUser(
    cr.requestedById,
    'CORRECTION_APPROVED',
    decision === 'APPROVED' ? 'درخواست اصلاح شما تأیید شد' : 'درخواست اصلاح شما رد شد',
    decision === 'APPROVED'
      ? 'مدیر درخواست اصلاح شما را تأیید کرد. نسخه جدید ثبت ایجاد شد.'
      : responseNote ?? 'مدیر درخواست اصلاح شما را رد کرد.',
    cr.entryId
  )
  return { correction: updated, entry: cr.entry }
}

/** قفل‌سازی تنبل: هر جا Entry خوانده می‌شود، اگر مهلت گذشته باشد وضعیت LOCKED ثبت می‌شود */
export async function lockIfExpired(entry: MaterialEntry): Promise<MaterialEntry> {
  if (entry.status !== 'LOCKED' && isLocked(entry)) {
    return db.materialEntry.update({ where: { id: entry.id }, data: { status: 'LOCKED', lockedAt: new Date() } })
  }
  return entry
}

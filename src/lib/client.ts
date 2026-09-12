"use client"

// ─────────────────────────── API Client ───────────────────────────

import { OFFLINE_QUEUED_CODE, matchQueueable, queueJson } from '@/lib/offline'

export class ClientApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit & { isForm?: boolean }): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(init?.headers as Record<string, string>),
  }
  if (!init?.isForm && init?.body && typeof init.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
    })
  } catch (err) {
    // خطای شبکه/آفلاین — اگر اندپوینت Idempotent باشد، در صف ارسال بعدی می‌رود
    const isPost = (init?.method ?? 'GET') === 'POST'
    const jsonBody = typeof init?.body === 'string' ? init.body : null
    if (isPost && jsonBody) {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(jsonBody)
      } catch {
        /* بدنه JSON نیست */
      }
      if (matchQueueable(path, parsed)) {
        await queueJson(path, parsed)
        throw new ClientApiError(0, OFFLINE_QUEUED_CODE, 'اتصال قطع است — درخواست در صف ارسال خودکار قرار گرفت.')
      }
    }
    throw err
  }

  let data: { success?: boolean; data?: T; code?: string; message?: string }
  try {
    data = await res.json()
  } catch {
    throw new ClientApiError(res.status, 'BAD_RESPONSE', 'پاسخ سرور نامعتبر است.')
  }
  if (!res.ok || data.success === false) {
    throw new ClientApiError(res.status, data.code ?? 'UNKNOWN', data.message ?? 'خطایی رخ داد.')
  }
  return data.data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body !== undefined ? JSON.stringify(body) : undefined }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form, isForm: true }),
}

// ─────────────────────────── انواع مشترک ───────────────────────────

export interface MeData {
  user: { id: string; username: string; fullName: string; role: string; workshopId: string | null; phone: string | null }
  permissions: string[]
  scope: { isGlobal: boolean; workshopIds: string[]; projectIds: string[] | null }
  workshops: Array<{ id: string; name: string; code: string }>
  projects: Array<{ id: string; name: string; code: string; workshopId: string | null }>
}

export interface MasterData {
  workshops: Array<{ id: string; name: string; code: string }>
  projects: Array<{ id: string; name: string; code: string; workshopId: string | null }>
  materials: Array<{ id: string; name: string; category: string | null; defaultUnit: string | null }>
  suppliers: Array<{ id: string; name: string; phone: string | null }>
  workers: Array<{ id: string; fullName: string; kind: string }>
  units: Array<{ id: string; title: string }>
}

export interface EntryListItem {
  id: string
  entryNumber: number
  type: string
  status: string
  workshopName: string
  supervisorName: string
  source: string | null
  sourceType: string
  deliveryAt: string | null
  projects: Array<{ id: string; name: string }>
  items: Array<{ materialName: string; quantity: number; unit: string }>
  hasInvoice: boolean
  attachmentsCount: number
  submittedAt: string | null
  decidedAt: string | null
  decisionNote: string | null
  currentVersion: number
  createdAt: string
}

export interface EntryDetailData {
  entry: {
    id: string
    entryNumber: number
    type: string
    status: string
    workshopId: string
    workshop: { id: string; name: string }
    supervisorId: string
    supervisor: { id: string; fullName: string }
    sourceType: string
    sourceSupplier: { id: string; name: string } | null
    sourceWorkshop: { id: string; name: string } | null
    sourceDescription: string | null
    notes: string | null
    hasInvoice: boolean
    deliveryAt: string | null
    submittedAt: string | null
    decidedAt: string | null
    decisionNote: string | null
    currentVersion: number
    editDeadline: string | null
    lockedAt: string | null
    createdAt: string
    updatedAt: string
    items: Array<{
      id: string
      materialId: string | null
      materialName: string
      quantity: number
      unit: string
      brand: string | null
      description: string | null
      batchNumber: string | null
      serialNumber: string | null
    }>
    projects: Array<{ project: { id: string; name: string; code: string } }>
    workers: Array<{ id: string; workerId: string | null; workerName: string; workerKind: string; role: string | null }>
    attachments: Array<{ id: string; kind: string; fileName: string; mimeType: string; size: number; version: number; replacedById: string | null; createdAt: string; uploadedBy?: { fullName: string } }>
    versions: Array<{ id: string; version: number; snapshotJson: string; changeReason: string | null; createdAt: string; changedBy: { fullName: string } }>
    corrections: Array<{ id: string; reason: string; status: string; responseNote: string | null; createdAt: string; requestedBy: { fullName: string } }>
    approvals: Array<{ id: string; action: string; reason: string | null; decidedAt: string; decidedBy: { fullName: string } }>
    stageLogs: Array<{ id: string; stage: string; action: string; note: string | null; createdAt: string; actor: { fullName: string; role: string } }>
    canEdit: boolean
    canResubmit: boolean
    canReview: boolean
    canTechReview?: boolean
    canWarehouseConfirm?: boolean
    canDeliver?: boolean
    canClose?: boolean
    canRollback?: boolean
    canRequestCorrection: boolean
    hint: string
  }
}

export interface VoiceDraft {
  type: string | null
  sourceType: string | null
  sourceSupplierId: string | null
  sourceWorkshopId: string | null
  sourceLabel: string | null
  projects: Array<{ id: string; name: string; score: number }>
  items: Array<{ materialId: string | null; materialName: string; matchedName: string | null; quantity: number | null; unit: string | null; brand: string | null }>
  workers: Array<{ workerId: string | null; workerName: string; workerKind: string; role: string | null }>
  hasInvoice: boolean
  notes: string | null
  transcriptId: string | null
  transcript: string
  confidence: number
  missing: string[]
  ambiguities: string[]
}

export interface DashboardSupervisor {
  role: 'SUPERVISOR'
  today: { total: number; approved: number; rejected: number }
  pending: number
  correction: number
  recent: Array<{
    id: string
    entryNumber: number
    status: string
    type: string
    supervisorName: string
    projects: string[]
    firstItem: { materialName: string; quantity: number; unit: string } | null
    itemsCount: number
    createdAt: string
  }>
}

export interface DashboardManager {
  role: 'MANAGER'
  today: { total: number }
  counts: { pending: number; rejected: number; correction: number; approved: number }
  kpis: {
    avgApprovalMinutes: number | null
    delayedCount: number
    openTasks: number
    completedTasksToday: number
    reportsToday: number
  }
  trend: Array<{ date: string; count: number }>
  byWorkshop: Array<{ workshopId: string; workshopName: string; approved: number; pending: number; rejected: number }>
  supervisorPerformance: Array<{
    supervisorId: string
    name: string
    total: number
    approved: number
    rejected: number
    avgApprovalMinutes: number | null
  }>
  byType: Array<{ type: string; count: number }>
  byProject: Array<{ projectId: string; name: string; count: number }>
  suppliers: Array<{ name: string; count: number }>
  transfers: number
  loans: number
  pendingReview: Array<{
    id: string
    entryNumber: number
    status: string
    type: string
    supervisorName: string
    projects: string[]
    firstItem: { materialName: string; quantity: number; unit: string } | null
    itemsCount: number
    submittedAt: string | null
  }>
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  entityId: string | null
  entityType: string | null
  isRead: boolean
  createdAt: string
}

export interface AuditLogItem {
  id: string
  userId: string | null
  action: string
  entityType: string
  entityId: string | null
  oldValue: string | null
  newValue: string | null
  ip: string | null
  userAgent: string | null
  reason: string | null
  createdAt: string
  user: { fullName: string; role: string } | null
}

// ─────────────────────────── ماژول وظایف و گزارش روزانه ───────────────────────────

export interface MasterDataWithSupervisors extends MasterData {
  supervisors: Array<{ id: string; fullName: string; workshopId: string | null }>
}

export interface DailyTaskListItem {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  sourceType: string
  projectId: string
  projectName: string
  workshopId: string
  workshopName: string
  createdById: string
  createdByName: string
  assignedDate: string
  dueDate: string | null
  sentAt: string | null
  completedAt: string | null
  isOverdue: boolean
  itemsCount: number
  completedItemsCount: number
  progress: number
  assignees: Array<{ id: string; fullName: string }>
  hasAudio: boolean
  transcribeStatus: string | null
  createdAt: string
}

export interface DailyTaskDetail {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  sourceType: string
  sourceTranscript: string | null
  projectId: string
  projectName: string
  workshopId: string
  workshopName: string
  createdById: string
  createdByName: string
  assignedDate: string
  dueDate: string | null
  sentAt: string | null
  completedAt: string | null
  completedByName: string | null
  completionNote: string | null
  cancelReason: string | null
  isOverdue: boolean
  progress: number
  assignees: Array<{ id: string; fullName: string; seenAt: string | null }>
  items: Array<{
    id: string
    title: string
    description: string | null
    sortOrder: number
    isCompleted: boolean
    completedAt: string | null
    completedByName: string | null
    completionNote: string | null
    photos: Array<{
      id: string
      fileName: string
      mimeType: string
      size: number
      createdAt: string
      uploadedByName: string
      url: string
    }>
  }>
  audio: {
    id: string
    fileName: string
    mimeType: string
    size: number
    transcribeStatus: string
    audioUrl: string
  } | null
  comments: Array<{
    id: string
    content: string
    transcript: string | null
    createdAt: string
    userId: string
    userName: string
    audio: { id: string; fileName: string; size: number; audioUrl: string } | null
  }>
  canComplete: boolean
  canEdit: boolean
  canSend: boolean
  canCancel: boolean
  canComment: boolean
}

export interface AudioUploadResult {
  audioId: string
  fileName: string
  mimeType: string
  size: number
  transcribeStatus: 'DONE' | 'FAILED' | 'NONE'
  transcribeError: string | null
  transcript: string | null
}

export interface ExtractedItem {
  title: string
  description: string | null
  sortOrder: number
}

export interface DailyReportListItem {
  id: string
  title: string
  content: string
  status: string
  sourceType: string
  projectId: string
  projectName: string
  workshopId: string
  workshopName: string
  reporterId: string
  reporterName: string
  reportDate: string
  submittedAt: string | null
  reviewedAt: string | null
  hasAudio: boolean
  transcribeStatus: string | null
  createdAt: string
}

export interface DailyReportDetail {
  id: string
  title: string
  content: string
  status: string
  sourceType: string
  transcript: string | null
  projectId: string
  projectName: string
  workshopId: string
  workshopName: string
  reporterId: string
  reporterName: string
  reportDate: string
  submittedAt: string | null
  reviewedAt: string | null
  reviewedByName: string | null
  reviewNote: string | null
  audio: {
    id: string
    fileName: string
    mimeType: string
    size: number
    transcribeStatus: string
    audioUrl: string
  } | null
  createdAt: string
  canEdit: boolean
  canSubmit: boolean
  canReview: boolean
}

export interface DailyDashboardData {
  stats: {
    todayTasks: number
    completedTasks: number
    pendingTasks: number
    progressPercent: number
    newReports: number
    overdueCount: number
  }
  overdue: Array<{ id: string; title: string; dueDate: string | null; assignees: string[]; progress: number }>
  tasks: Array<{
    id: string
    title: string
    status: string
    priority: string
    projectName: string
    createdByName: string
    assignedDate: string
    dueDate: string | null
    completedAt: string | null
    isOverdue: boolean
    assignees: string[]
    progress: number
    createdAt: string
  }>
  reports: Array<{
    id: string
    title: string
    status: string
    sourceType: string
    reporterName: string
    projectName: string
    workshopName: string
    reportDate: string
    submittedAt: string | null
    hasAudio: boolean
  }>
  supervisorActivity: Array<{ userId: string; fullName: string; lastAt: string; action: string }>
  timeline: Array<{ id: string; action: string; entityType: string; entityId: string | null; userName: string; createdAt: string }>
}

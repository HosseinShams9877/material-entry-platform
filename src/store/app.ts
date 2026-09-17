"use client"

import { create } from 'zustand'
import type { MeData } from '@/lib/client'

// ─────────────────────────── ناوبری SPA ───────────────────────────

export type ScreenName =
  | 'login'
  | 'supervisor-home'
  | 'manager-dashboard'
  | 'admin-panel'
  | 'entry-type-select'
  | 'manual-entry'
  | 'entry-history'
  | 'entry-detail'
  | 'notifications'
  | 'profile'
  | 'pending-approvals'
  | 'audit-logs'
  | 'reports'
  | 'admin-users'
  | 'admin-roles'
  | 'admin-workshops'
  | 'admin-projects'
  | 'admin-materials'
  | 'admin-suppliers'
  | 'admin-workers'
  | 'admin-corrections'
  | 'daily-tasks'
  | 'daily-task-form'
  | 'daily-task-detail'
  | 'daily-reports'
  | 'daily-report-form'
  | 'daily-report-detail'
  | 'daily-dashboard'
  | 'statements'
  | 'statement-form'
  | 'statement-detail'
  | 'purchase-requests'
  | 'purchase-form'
  | 'purchase-detail'
  | 'work-reports'
  | 'work-report-form'
  | 'inventory'
  | 'finance'
  | 'performance'

export interface ScreenStackItem {
  name: ScreenName
  params?: Record<string, unknown>
}

interface AppState {
  session: MeData | null
  sessionLoading: boolean
  stack: ScreenStackItem[]
  unreadCount: number
  online: boolean

  setSession: (s: MeData | null) => void
  setSessionLoading: (v: boolean) => void
  navigate: (name: ScreenName, params?: Record<string, unknown>, replace?: boolean) => void
  back: () => void
  resetTo: (name: ScreenName, params?: Record<string, unknown>) => void
  setUnreadCount: (n: number) => void
  setOnline: (v: boolean) => void
  current: () => ScreenStackItem
}

export const useApp = create<AppState>((set, get) => ({
  session: null,
  sessionLoading: true,
  stack: [{ name: 'login' }],
  unreadCount: 0,
  online: true,

  setSession: (session) => set({ session }),
  setSessionLoading: (sessionLoading) => set({ sessionLoading }),
  navigate: (name, params, replace) =>
    set((state) => ({
      stack: replace
        ? [...state.stack.slice(0, -1), { name, params }]
        : [...state.stack, { name, params }],
    })),
  back: () =>
    set((state) => ({
      stack: state.stack.length > 1 ? state.stack.slice(0, -1) : state.stack,
    })),
  resetTo: (name, params) => set({ stack: [{ name, params }] }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setOnline: (online) => set({ online }),
  current: () => get().stack[get().stack.length - 1],
}))

/** نقش فعلی کاربر */
export function useRole(): string | null {
  return useApp((s) => s.session?.user.role ?? null)
}

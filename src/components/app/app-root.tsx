"use client"

import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'
import { api, type MeData } from '@/lib/client'
import { InlineSpinner } from '@/components/app/shared'
import LoginScreen from '@/components/app/screens/login'
import SupervisorHome from '@/components/app/screens/supervisor-home'
import EntryTypeSelect from '@/components/app/screens/entry-type-select'
import ManualEntry from '@/components/app/screens/manual-entry'
import EntryHistory from '@/components/app/screens/entry-history'
import EntryDetail from '@/components/app/screens/entry-detail'
import NotificationsScreen from '@/components/app/screens/notifications'
import ProfileScreen from '@/components/app/screens/profile'
import ManagerDashboard from '@/components/app/screens/manager-dashboard'
import PendingApprovals from '@/components/app/screens/pending-approvals'
import AuditLogs from '@/components/app/screens/audit-logs'
import Reports from '@/components/app/screens/reports'
import AdminUsers from '@/components/app/screens/admin-users'
import AdminRoles from '@/components/app/screens/admin-roles'
import AdminWorkshops from '@/components/app/screens/admin-workshops'
import AdminProjects from '@/components/app/screens/admin-projects'
import AdminMaterials from '@/components/app/screens/admin-materials'
import AdminSuppliers from '@/components/app/screens/admin-suppliers'
import AdminWorkers from '@/components/app/screens/admin-workers'
import AdminPanel from '@/components/app/screens/admin-panel'
import DailyTasks from '@/components/app/screens/daily-tasks'
import DailyTaskForm from '@/components/app/screens/daily-task-form'
import DailyTaskDetail from '@/components/app/screens/daily-task-detail'
import DailyReports from '@/components/app/screens/daily-reports'
import DailyReportForm from '@/components/app/screens/daily-report-form'
import DailyReportDetail from '@/components/app/screens/daily-report-detail'
import DailyDashboard from '@/components/app/screens/daily-dashboard'
import Statements from '@/components/app/screens/statements'
import StatementForm from '@/components/app/screens/statement-form'
import StatementDetail from '@/components/app/screens/statement-detail'
import PurchaseRequests from '@/components/app/screens/purchase-requests'
import PurchaseForm from '@/components/app/screens/purchase-form'
import PurchaseDetail from '@/components/app/screens/purchase-detail'
import WorkReports from '@/components/app/screens/work-reports'
import WorkReportForm from '@/components/app/screens/work-report-form'
import Inventory from '@/components/app/screens/inventory'
import Finance from '@/components/app/screens/finance'
import Performance from '@/components/app/screens/performance'
import { BottomNav } from '@/components/app/shared'
import { installOfflineSync, getOutboxCount, processOutbox } from '@/lib/offline'
import { toast } from 'sonner'

const NO_NAV_SCREENS = [
  'login', 'manual-entry', 'entry-detail',
  'daily-task-form', 'daily-task-detail', 'daily-report-form', 'daily-report-detail',
  'statement-form', 'statement-detail', 'purchase-form', 'purchase-detail', 'work-report-form',
]

const ADMIN_SCREENS = new Set(['admin-panel', 'admin-users', 'admin-roles', 'admin-workshops', 'admin-projects', 'admin-materials', 'admin-suppliers', 'admin-workers'])

function ScreenRenderer({ name, params }: { name: string; params?: Record<string, unknown> }) {
  switch (name) {
    case 'login':
      return <LoginScreen />
    case 'supervisor-home':
      return <SupervisorHome />
    case 'manager-dashboard':
      return <ManagerDashboard />
    case 'entry-type-select':
      return <EntryTypeSelect />
    case 'manual-entry':
      return <ManualEntry params={params} />
    case 'entry-history':
      return <EntryHistory params={params} />
    case 'entry-detail':
      return <EntryDetail params={params} />
    case 'notifications':
      return <NotificationsScreen />
    case 'profile':
      return <ProfileScreen />
    case 'pending-approvals':
      return <PendingApprovals />
    case 'audit-logs':
      return <AuditLogs />
    case 'reports':
      return <Reports />
    case 'admin-panel':
      return <AdminPanel />
    case 'daily-tasks':
      return <DailyTasks />
    case 'daily-task-form':
      return <DailyTaskForm params={params} />
    case 'daily-task-detail':
      return <DailyTaskDetail params={params} />
    case 'daily-reports':
      return <DailyReports />
    case 'daily-report-form':
      return <DailyReportForm params={params} />
    case 'daily-report-detail':
      return <DailyReportDetail params={params} />
    case 'daily-dashboard':
      return <DailyDashboard />
    case 'statements':
      return <Statements />
    case 'statement-form':
      return <StatementForm params={params} />
    case 'statement-detail':
      return <StatementDetail params={params} />
    case 'purchase-requests':
      return <PurchaseRequests />
    case 'purchase-form':
      return <PurchaseForm params={params} />
    case 'purchase-detail':
      return <PurchaseDetail params={params} />
    case 'work-reports':
      return <WorkReports />
    case 'work-report-form':
      return <WorkReportForm />
    case 'inventory':
      return <Inventory />
    case 'finance':
      return <Finance />
    case 'performance':
      return <Performance />
    case 'admin-users':
      return <AdminUsers />
    case 'admin-roles':
      return <AdminRoles />
    case 'admin-workshops':
      return <AdminWorkshops />
    case 'admin-projects':
      return <AdminProjects />
    case 'admin-materials':
      return <AdminMaterials />
    case 'admin-suppliers':
      return <AdminSuppliers />
    case 'admin-workers':
      return <AdminWorkers />
    default:
      return <LoginScreen />
  }
}

export default function AppRoot() {
  const { session, sessionLoading, stack, setSession, setSessionLoading, setUnreadCount, setOnline, online, resetTo } = useApp()
  const current = stack[stack.length - 1]
  const [outboxCount, setOutboxCount] = useState(0)

  // نصب شنونده‌های Offline Sync + رصد تغییر صف
  useEffect(() => {
    installOfflineSync((count) => setOutboxCount(count))
    void getOutboxCount().then(setOutboxCount)
    const onSynced = () => {
      void getOutboxCount().then(setOutboxCount)
      toast.success('داده‌های آفلاین با موفقیت همگام شد')
    }
    const onDropped = () => void getOutboxCount().then(setOutboxCount)
    window.addEventListener('smi:outbox-synced', onSynced)
    window.addEventListener('smi:outbox-dropped', onDropped)
    return () => {
      window.removeEventListener('smi:outbox-synced', onSynced)
      window.removeEventListener('smi:outbox-dropped', onDropped)
    }
  }, [])

  // هنگام بازگشت اتصال — تلاش فوری برای خالی‌کردن صف
  useEffect(() => {
    if (online && outboxCount > 0) void processOutbox()
  }, [online])

  // بازیابی نشست + ثبت Service Worker + وضعیت اتصال
  useEffect(() => {
    let alive = true
    api
      .get<MeData>('/api/v1/auth/me')
      .then((me) => {
        if (!alive) return
        setSession(me)
        const role = me.user.role
        if (role === 'PROJECT_MANAGER' || role === 'GENERAL_MANAGER' || role === 'ACCOUNTANT') resetTo('manager-dashboard')
        else if (role === 'SUPER_ADMIN' || role === 'ADMIN') resetTo('admin-panel')
        else resetTo('supervisor-home')
      })
      .catch(() => {
        if (!alive) return
        setSession(null)
        resetTo('login')
      })
      .finally(() => {
        if (alive) setSessionLoading(false)
      })

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }

    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      alive = false
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
     
  }, [])

  // شمارش اعلان‌های خوانده‌نشده
  useEffect(() => {
    if (!session) return
    let alive = true
    const load = () =>
      api
        .get<{ unreadCount: number }>('/api/v1/notifications?unread=1')
        .then((d) => alive && setUnreadCount(d.unreadCount))
        .catch(() => undefined)
    load()
    const timer = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
     
  }, [session])

  if (sessionLoading) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-background">
        <InlineSpinner label="در حال بارگذاری…" />
      </main>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  const showNav = !NO_NAV_SCREENS.includes(current.name)

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {!online ? (
        <div className="sticky top-0 z-50 bg-amber-500 text-white text-center text-xs py-1.5 font-medium">
          اتصال اینترنت قطع است — ثبت‌ها به‌صورت پیش‌نویس ذخیره می‌شوند
        </div>
      ) : outboxCount > 0 ? (
        <div className="sticky top-0 z-50 bg-blue-600 text-white text-center text-xs py-1.5 font-medium flex items-center justify-center gap-2">
          <span>
            {outboxCount > 0 ? `${outboxCount.toLocaleString('fa-IR')} درخواست در صف ارسال خودکار` : 'در حال همگام‌سازی…'}
          </span>
        </div>
      ) : null}
      <main className={`flex-1 ${showNav ? 'pb-20' : ''}`}>
        <ScreenRenderer name={current.name} params={current.params} />
      </main>
      {showNav ? <BottomNav active={current.name} /> : null}
      {ADMIN_SCREENS.has(current.name) ? null : null}
    </div>
  )
}

"use client"

import { useState } from 'react'
import {
  LogOut, ShieldCheck, ClipboardList, Building2, FolderKanban,
  Package, Factory, Users, UserCog, KeyRound, FileBarChart, Wifi, MonitorSmartphone, Smartphone,
  ListTodo, FileBarChart2, FileSignature, ShoppingCart, ClipboardCheck, Wallet, Gauge,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/client'
import { useApp } from '@/store/app'
import { ScreenHeader } from '@/components/app/shared'
import { ROLES } from '@/lib/permissions'
import { toFa } from '@/lib/fa'

export default function ProfileScreen() {
  const session = useApp((s) => s.session)
  const setSession = useApp((s) => s.setSession)
  const resetTo = useApp((s) => s.resetTo)
  const navigate = useApp((s) => s.navigate)
  const [loggingOut, setLoggingOut] = useState(false)
  const [loggingOutAll, setLoggingOutAll] = useState(false)
  const online = useApp((s) => s.online)

  if (!session) return null
  const role = session.user.role
  const isSupervisor = role === 'WORKSHOP_SUPERVISOR'
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const isManager = role === 'PROJECT_MANAGER' || role === 'WORKSHOP_MANAGER'

  async function logout() {
    setLoggingOut(true)
    await api.post('/api/v1/auth/logout').catch(() => undefined)
    setSession(null)
    resetTo('login')
  }

  /** خروج از همهٔ نشست‌ها — همهٔ Sessionهای این کاربر در سرور باطل می‌شوند */
  async function logoutAll() {
    setLoggingOutAll(true)
    await api.post('/api/v1/auth/logout-all').catch(() => undefined)
    setSession(null)
    resetTo('login')
  }

  const menuItems: Array<{ label: string; icon: React.ReactNode; onClick: () => void; hint?: string }> = []

  const perms = session.permissions ?? []

  menuItems.push(
    { label: 'وظایف روزانه', icon: <ListTodo className="size-5" />, onClick: () => navigate('daily-tasks') },
    { label: 'گزارش‌های روزانه', icon: <FileBarChart2 className="size-5" />, onClick: () => navigate('daily-reports') }
  )

  if (perms.includes('statement.view')) {
    menuItems.push({ label: 'صورت وضعیت‌ها', icon: <FileSignature className="size-5" />, onClick: () => navigate('statements') })
  }
  if (perms.includes('purchase.view')) {
    menuItems.push({ label: 'درخواست‌های خرید', icon: <ShoppingCart className="size-5" />, onClick: () => navigate('purchase-requests') })
  }
  if (perms.includes('inventory.view')) {
    menuItems.push({ label: 'انبار کارگاه', icon: <Package className="size-5" />, onClick: () => navigate('inventory') })
  }
  if (perms.includes('workreport.view')) {
    menuItems.push({ label: 'گزارش کار کارگران', icon: <ClipboardCheck className="size-5" />, onClick: () => navigate('work-reports') })
  }
  if (perms.includes('performance.view')) {
    menuItems.push({ label: 'ارزیابی و KPI', icon: <Gauge className="size-5" />, onClick: () => navigate('performance') })
  }
  if (perms.includes('finance.view')) {
    menuItems.push({ label: 'مالی (پرداخت و بدهی)', icon: <Wallet className="size-5" />, onClick: () => navigate('finance') })
  }

  if (isAdmin) {
    menuItems.push(
      { label: 'مدیریت کاربران', icon: <UserCog className="size-5" />, onClick: () => navigate('admin-users') },
      { label: 'نقش‌ها و دسترسی‌ها', icon: <KeyRound className="size-5" />, onClick: () => navigate('admin-roles') },
      { label: 'کارگاه‌ها', icon: <Building2 className="size-5" />, onClick: () => navigate('admin-workshops') },
      { label: 'پروژه‌ها', icon: <FolderKanban className="size-5" />, onClick: () => navigate('admin-projects') },
      { label: 'مصالح', icon: <Package className="size-5" />, onClick: () => navigate('admin-materials') },
      { label: 'تأمین‌کنندگان', icon: <Factory className="size-5" />, onClick: () => navigate('admin-suppliers') },
      { label: 'کارگران', icon: <Users className="size-5" />, onClick: () => navigate('admin-workers') }
    )
  }
  if (isManager || isAdmin) {
    menuItems.push(
      { label: 'گزارش‌ها', icon: <FileBarChart className="size-5" />, onClick: () => navigate('reports') },
      { label: 'حسابرسی', icon: <ClipboardList className="size-5" />, onClick: () => navigate('audit-logs') }
    )
  }
  if (isSupervisor) {
    menuItems.push({ label: 'حسابرسی عملیات من', icon: <ClipboardList className="size-5" />, onClick: () => navigate('audit-logs') })
  }

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="پروفایل" />

      {/* کارت کاربر */}
      <div className="p-4">
        <div className="rounded-2xl bg-zinc-900 text-white p-5 mb-4">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-2xl bg-amber-500 flex items-center justify-center text-xl font-bold text-zinc-900 shrink-0">
              {session.user.fullName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-bold truncate">{session.user.fullName}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{ROLES[role as keyof typeof ROLES] ?? role}</p>
              <p dir="ltr" className="text-[11px] text-zinc-500 mt-0.5 text-right">
                {session.user.username}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
            {session.workshops.map((w) => (
              <span key={w.id} className="bg-zinc-800 rounded-md px-2 py-1">{w.name}</span>
            ))}
            {session.projects.slice(0, 3).map((p) => (
              <span key={p.id} className="bg-zinc-800 rounded-md px-2 py-1">{p.name}</span>
            ))}
          </div>
        </div>

        {/* وضعیت‌ها */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
            <Wifi className={`size-4 ${online ? 'text-green-600' : 'text-red-500'}`} />
            <span className="text-xs">{online ? 'متصل' : 'قطع اتصال'}</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
            <MonitorSmartphone className="size-4 text-accent" />
            <span className="text-xs">نسخه {toFa('1.0.0')}</span>
          </div>
        </div>

        {/* منو */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-right border-b border-border last:border-0 hover:bg-secondary/60 transition-colors min-h-14"
            >
              <span className="text-muted-foreground">{item.icon}</span>
              <span className="text-sm font-medium flex-1">{item.label}</span>
              <span className="text-xs text-muted-foreground">‹</span>
            </button>
          ))}
        </div>

        {/* امنیت */}
        <div className="rounded-2xl border border-border bg-card p-4 mb-4 flex items-start gap-3">
          <ShieldCheck className="size-5 text-green-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-6 text-muted-foreground">
            جلسه شما با کوکی امن محافظت می‌شود. تمام عملیات در سامانه ثبت و قابل حسابرسی است. اطلاعات کارگاه‌های دیگر برای شما نمایش داده نمی‌شود.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="outline"
            onClick={() => void logout()}
            disabled={loggingOut}
            className="h-12 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-4" />
            {loggingOut ? 'در حال خروج…' : 'خروج از حساب'}
          </Button>
          <Button
            variant="outline"
            onClick={() => void logoutAll()}
            disabled={loggingOutAll}
            className="h-12 rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            <Smartphone className="size-4" />
            {loggingOutAll ? 'در حال خروج…' : 'خروج از همهٔ دستگاه‌ها'}
          </Button>
        </div>
      </div>
    </div>
  )
}

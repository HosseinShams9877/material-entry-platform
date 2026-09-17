"use client"

import { useEffect } from 'react'
import {
  Users, KeyRound, Building2, FolderKanban, Package, Factory, HardHat,
  ClipboardList, ShieldCheck, ChevronLeft, LayoutDashboard,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { ScreenHeader } from '@/components/app/shared'
import { toFa } from '@/lib/fa'

/** پنل مدیریت — متمرکز برای ادمین‌ها */
export default function AdminPanel() {
  const navigate = useApp((s) => s.navigate)
  const session = useApp((s) => s.session)
  const resetTo = useApp((s) => s.resetTo)

  useEffect(() => {
    // اگر ادمین نبود، به صفحه نقش خودش برگرد
    if (session && !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
      resetTo(session.user.role === 'PROJECT_MANAGER' ? 'manager-dashboard' : 'supervisor-home')
    }
  }, [session, resetTo])

  const items = [
    { label: 'داشبورد مدیر', hint: 'نمای کلی ثبت‌ها', icon: <LayoutDashboard className="size-5" />, onClick: () => navigate('manager-dashboard') },
    { label: 'مدیریت کاربران', hint: 'کاربران، نقش‌ها و دسترسی‌ها', icon: <Users className="size-5" />, onClick: () => navigate('admin-users') },
    { label: 'نقش‌ها و دسترسی‌ها', hint: 'ماتریس نقش/دسترسی', icon: <KeyRound className="size-5" />, onClick: () => navigate('admin-roles') },
    { label: 'کارگاه‌ها', icon: <Building2 className="size-5" />, onClick: () => navigate('admin-workshops') },
    { label: 'پروژه‌ها', icon: <FolderKanban className="size-5" />, onClick: () => navigate('admin-projects') },
    { label: 'مصالح', icon: <Package className="size-5" />, onClick: () => navigate('admin-materials') },
    { label: 'تأمین‌کنندگان', icon: <Factory className="size-5" />, onClick: () => navigate('admin-suppliers') },
    { label: 'کارگران', icon: <HardHat className="size-5" />, onClick: () => navigate('admin-workers') },
    { label: 'حسابرسی', hint: 'لاگ کامل عملیات', icon: <ClipboardList className="size-5" />, onClick: () => navigate('audit-logs') },
  ]

  return (
    <div className="max-w-lg mx-auto min-h-dvh">
      <ScreenHeader title="پنل مدیریت" subtitle="پیکربندی سامانه و داده‌های پایه" />
      <div className="p-4">
        <div className="rounded-2xl bg-zinc-900 text-white p-4 mb-4 flex items-center gap-3">
          <ShieldCheck className="size-8 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-bold">سامانه امن ثبت ورود مصالح</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {session ? `${toFa(session.projects.length)} پروژه فعال در دسترس شما` : ''}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-right border-b border-border last:border-0 hover:bg-secondary/60 transition-colors min-h-14"
            >
              <span className="text-accent">{item.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                {item.hint ? <span className="block text-[11px] text-muted-foreground">{item.hint}</span> : null}
              </span>
              <ChevronLeft className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

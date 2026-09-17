"use client"

import { useState } from 'react'
import { toast } from 'sonner'
import { PackageCheck, Lock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ClientApiError, type MeData } from '@/lib/client'
import { useApp } from '@/store/app'

const DEMO_ACCOUNTS = [
  { username: 'supervisor.sa', label: 'سرپرست سعادت‌آباد' },
  { username: 'manager.sa', label: 'مدیر پروژه' },
  { username: 'admin', label: 'مدیر سیستم' },
  { username: 'supervisor.da', label: 'سرپرست دروس' },
]

export default function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const setSession = useApp((s) => s.setSession)
  const resetTo = useApp((s) => s.resetTo)

  async function handleLogin(un?: string, pw?: string) {
    const u = un ?? username
    const p = pw ?? password
    if (!u.trim() || !p.trim()) {
      toast.error('نام کاربری و گذرواژه را وارد کنید.')
      return
    }
    setLoading(true)
    try {
      await api.post<{ user: MeData['user'] }>('/api/v1/auth/login', { username: u, password: p })
      const me = await api.get<MeData>('/api/v1/auth/me')
      setSession(me)
      toast.success(`خوش آمدید، ${me.user.fullName}`)
      const role = me.user.role
      if (role === 'PROJECT_MANAGER' || role === 'GENERAL_MANAGER' || role === 'ACCOUNTANT') resetTo('manager-dashboard')
      else if (role === 'SUPER_ADMIN' || role === 'ADMIN') resetTo('admin-panel')
      else resetTo('supervisor-home')
    } catch (err) {
      if (err instanceof ClientApiError) toast.error(err.message)
      else toast.error('خطا در برقراری ارتباط با سرور.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-800 text-white">
      <div className="flex-1 flex flex-col justify-center px-8 pt-16 pb-8 max-w-md w-full mx-auto">
        {/* برند */}
        <div className="text-center mb-10">
          <div className="mx-auto size-20 rounded-3xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20 mb-5">
            <PackageCheck className="size-10 text-zinc-900" strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-bold mb-1">ثبت ورود مصالح</h1>
          <p className="text-sm text-zinc-400 leading-6">
            ثبت سریع ورود مصالح کارگاه — با صدا یا دستی،
            <br />
            در کمتر از ۳۰ ثانیه
          </p>
        </div>

        {/* فرم */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleLogin()
          }}
          className="space-y-3"
        >
          <div className="relative">
            <User className="size-5 absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              dir="ltr"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="نام کاربری"
              autoComplete="username"
              autoCapitalize="none"
              className="w-full h-12 rounded-xl bg-zinc-800/80 border border-zinc-700 pr-11 pl-4 text-white placeholder:text-zinc-500 outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div className="relative">
            <Lock className="size-5 absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              dir="ltr"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="گذرواژه"
              autoComplete="current-password"
              className="w-full h-12 rounded-xl bg-zinc-800/80 border border-zinc-700 pr-11 pl-4 text-white placeholder:text-zinc-500 outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-900 font-bold text-base"
          >
            {loading ? 'در حال ورود…' : 'ورود'}
          </Button>
        </form>

        {/* حساب‌های آزمایشی */}
        <div className="mt-10">
          <p className="text-xs text-zinc-500 text-center mb-3">حساب‌های آزمایشی (گذرواژه همه: ۱۲۳۴۵۶)</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.username}
                type="button"
                onClick={() => handleLogin(acc.username, '123456')}
                disabled={loading}
                className="rounded-xl bg-zinc-800/60 border border-zinc-700/60 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700/60 hover:border-amber-500/50 transition-colors text-right"
              >
                <span className="block font-medium text-zinc-200">{acc.label}</span>
                <span dir="ltr" className="block text-[10px] text-zinc-500 mt-0.5">
                  {acc.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <footer className="pb-6 text-center">
        <p className="text-[11px] text-zinc-600 flex items-center justify-center gap-1.5">
          <PackageCheck className="size-3.5" />
          پلتفرم امن ثبت ورود مصالح ساختمانی
        </p>
      </footer>
    </main>
  )
}

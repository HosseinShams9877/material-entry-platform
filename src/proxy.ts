import { NextResponse, type NextRequest } from 'next/server'

/** Secure Headers — برای همه پاسخ‌ها (Next.js 16 proxy، نام قبلی: middleware) */
export default function proxy(_req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

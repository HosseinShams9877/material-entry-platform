// Service Worker — حداقلی و امن:
// - فقط منابع استاتیک را cache می‌کند (app-shell)
// - درخواست‌های API هرگز cache نمی‌شوند (تازگی داده و امنیت)
// - Offline Draft در localStorage مرورگر نگهداری می‌شود (کلیدهای smi_offline_*)
const CACHE = 'smi-static-v1'
const STATIC_ASSETS = ['/icon-192.png', '/icon-512.png', '/icon.svg', '/manifest.webmanifest', '/fonts/Vazirmatn-Regular.woff2', '/fonts/Vazirmatn-Medium.woff2', '/fonts/Vazirmatn-SemiBold.woff2', '/fonts/Vazirmatn-Bold.woff2']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // API و صفحات — همیشه شبکه (Server Timestamp ملاک است)
  if (url.pathname.startsWith('/api/') || event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ success: false, code: 'OFFLINE', message: 'اتصال برقرار نیست — ثبت شما در پیش‌نویس آفلاین ذخیره می‌شود.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    return
  }
  // استاتیک — cache first
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => undefined)
            return res
          })
      )
    )
  }
})

// Background Sync — هنگام بازگشت اتصال، صف آفلاین کلاینت را بیدار می‌کند
self.addEventListener('sync', (event) => {
  if (event.tag === 'outbox-sync') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'OUTBOX_SYNC' }))
      })
    )
  }
})

// پیام از کلاینت — اجازهٔ فعال‌سازی فوری نسخهٔ جدید + درخواست Sync دستی
self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'SKIP_WAITING') self.skipWaiting()
  if (data.type === 'REQUEST_OUTBOX_SYNC') {
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'OUTBOX_SYNC' }))
    })
  }
})

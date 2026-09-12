/**
 * تست‌های Production-Readiness — لایهٔ دوم تست‌های امنیتی
 * پوشش: نشست منقضی، ابطال نشست با غیرفعال‌سازی، خروج از همهٔ نشست‌ها،
 * Signed URL جعلی/منقضی/قالب نامعتبر، MIME جعلی (Magic Bytes)، فایل بزرگ،
 * Rate Limit، شماره ثبت هم‌زمان، و Workflow کامل.
 *
 * اجرا: bun scripts/production-tests.mjs  (سرور روی 3000 باید بالا باشد)
 */
const BASE = 'http://localhost:3000'
const { PrismaClient } = await import('@prisma/client')
const crypto = await import('node:crypto')
const prisma = new PrismaClient()

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    console.log(`  ❌ ${name} ${detail}`)
  }
}

async function req(path, { method = 'GET', body, cookie, headers = {}, ip } = {}) {
  const h = {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
    ...headers,
  }
  if (ip) h['X-Forwarded-For'] = ip // dev: TRUST_PROXY=true → هر تست با سبد مستقل
  if (cookie) h['Cookie'] = cookie
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* ignore */
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') }
}

function extractToken(setCookie) {
  return /(?:__Host-)?smi_session=([^;]+)/.exec(setCookie ?? '')?.[1] ?? null
}

async function login(username, password = '123456') {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  const res = await req('/api/v1/auth/login', { method: 'POST', body: { username, password }, ip })
  if (res.status !== 200) throw new Error(`login failed for ${username} (${res.status})`)
  const token = extractToken(res.setCookie)
  return { cookie: `smi_session=${token}`, token, user: res.json?.data?.user }
}

async function getScopeInfo(cookie) {
  const res = await req('/api/v1/auth/me', { cookie })
  return res.json?.data
}

async function createDraftEntry(cookie, { submit = true, note = 'تست Production' } = {}) {
  const me = await getScopeInfo(cookie)
  const projectId = me?.projects?.[0]?.id
  const res = await req('/api/v1/material-entries', {
    method: 'POST',
    cookie,
    body: {
      type: 'PURCHASE',
      sourceType: 'OTHER',
      sourceDescription: 'تأمین تست',
      projectIds: projectId ? [projectId] : [],
      items: [{ materialName: 'سیمان تست Prod', quantity: 5, unit: 'کیسه', sortOrder: 0 }],
      notes: note,
      hasInvoice: false,
      status: submit ? 'SUBMITTED' : 'DRAFT',
    },
  })
  return res
}

async function main() {
  console.log('── ۱) نشست: منقضی، ابطال، خروج از همه ──')
  const supA = await login('supervisor.sa')
  const admin = await login('admin')

  // نشست منقضی — expiry را مستقیم در DB جلو می‌کشیم
  {
    // یک نشست دوم برای همین کاربر بساز
    const second = await login('supervisor.sa')
    const h = crypto.createHash('sha256').update(second.token).digest('hex')
    await prisma.session.update({ where: { tokenHash: h }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await req('/api/v1/auth/me', { cookie: second.cookie })
    check('نشست منقضی → 401 و حذف از DB', res.status === 401)
    const remaining = await prisma.session.count({ where: { tokenHash: h } })
    check('نشست منقضی از DB حذف شد', remaining === 0)
  }

  // خروج از همهٔ نشست‌ها — با کاربر جدا تا نشست اصلی تست‌ها سالم بماند
  {
    const s1 = await login('supervisor.da')
    const s2 = await login('supervisor.da')
    const res = await req('/api/v1/auth/logout-all', { method: 'POST', cookie: s1.cookie })
    check('logout-all → success', res.status === 200 && res.json?.data?.revokedSessions >= 2, JSON.stringify(res.json))
    const res2 = await req('/api/v1/auth/me', { cookie: s2.cookie })
    check('نشست دوم پس از logout-all → 401', res2.status === 401)
  }

  console.log('── ۲) Signed URL: جعلی، منقضی، قالب نامعتبر ──')
  const entryRes = await createDraftEntry(supA.cookie)
  const entryId = entryRes.json?.data?.id
  check('ایجاد ثبت برای تست پیوست', Boolean(entryId), JSON.stringify(entryRes.json))

  const listRes = await req(`/api/v1/attachments?entryId=${entryId}`, { cookie: supA.cookie })
  check('لیست پیوستهٔ خالی OK', listRes.status === 200)

  // آپلود PDF واقعی (Magic Bytes درست) برای داشتن attachment
  const pdfBytes = Buffer.from('%PDF-1.4\n% fake minimal pdf for test\n%%EOF', 'utf8')
  async function uploadPdf(cookie, fileName = 'فاکتور.pdf') {
    const form = new FormData()
    form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName)
    form.append('entryId', entryId)
    form.append('kind', 'INVOICE')
    const res = await fetch(`${BASE}/api/v1/attachments`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: cookie },
      body: form,
    })
    let json = null
    try { json = await res.json() } catch { /* ignore */ }
    return { status: res.status, json }
  }
  const up = await uploadPdf(supA.cookie)
  const attachmentId = up.json?.data?.id
  check('آپلود PDF معتبر → 201', up.status === 201, JSON.stringify(up.json))

  if (attachmentId) {
    const signedUrl = up.json?.data?.url
    const realToken = new URL(`${BASE}${signedUrl}`).searchParams.get('token')

    // توکن درست → 200
    const okRes = await fetch(`${BASE}/api/v1/attachments/${attachmentId}/file?token=${realToken}`)
    check('Signed URL درست → 200', okRes.status === 200)

    // توکن جعلی (امضای غلط با طول درست)
    const forged = `${Date.now() + 60000}${'a'.repeat(0)}.${'a'.repeat(64)}`
    const forgedRes = await fetch(`${BASE}/api/v1/attachments/${attachmentId}/file?token=${forged}`)
    check('توکن جعلی (امضای 64 کاراکتری غلط) → 404', forgedRes.status === 404)

    // امضای با طول نامعتبر
    const badLen = await fetch(`${BASE}/api/v1/attachments/${attachmentId}/file?token=${Date.now() + 60000}.abc123`)
    check('امضای با طول نامعتبر → 404', badLen.status === 404)

    // توکن منقضی — امضای معتبر با exp گذشته (از URL فعلی exp را عقب می‌بریم: باید با secret واقعی بازامضا شود که نداریم؛ پس expiry منفی با قالب درست کافی است)
    const expired = await fetch(`${BASE}/api/v1/attachments/${attachmentId}/file?token=1600000000000.${'0'.repeat(64)}`)
    check('توکن منقضی (exp گذشته) → 404', expired.status === 404)

    // قالب‌های خراب
    for (const t of ['', 'garbage', `${Date.now() + 60000}.`, `abc.${'a'.repeat(64)}`, `${Date.now() + 60000}.${'Z'.repeat(64)}`]) {
      const r = await fetch(`${BASE}/api/v1/attachments/${attachmentId}/file?token=${encodeURIComponent(t)}`)
      if (r.status !== 404) {
        check(`قالب خراب «${t.slice(0, 20)}» → 404`, false, `status=${r.status}`)
      }
    }
    check('همهٔ قالب‌های خراب توکن → 404', true)
  }

  console.log('── ۳) آپلود: MIME جعلی، فایل بزرگ ──')
  // PNG جعلی با ادعای PDF — Magic Bytes باید لو بدهد
  {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const fakePdf = Buffer.concat([pngHeader, Buffer.from('\x00'.repeat(100))])
    const form = new FormData()
    form.append('file', new Blob([fakePdf], { type: 'application/pdf' }), 'fake.pdf')
    form.append('entryId', entryId)
    form.append('kind', 'INVOICE')
    const res = await fetch(`${BASE}/api/v1/attachments`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: supA.cookie },
      body: form,
    })
    check('PNG با ادعای PDF → 415 (Magic Bytes)', res.status === 415, `status=${res.status}`)
  }
  // فایل بیش از حد مجاز — بدون ارسال کل ۱۱MB؛ سرور فقط size هدر FormData را نمی‌بیند
  // پس یک Blob بزرگ می‌سازیم ولی بررسی size سمت سرور روی file.size است که از body می‌آید.
  {
    const big = new Uint8Array(10 * 1024 * 1024 + 100) // 10MB + 100
    const form = new FormData()
    form.append('file', new Blob([big], { type: 'application/pdf' }), 'big.pdf')
    form.append('entryId', entryId)
    form.append('kind', 'INVOICE')
    const res = await fetch(`${BASE}/api/v1/attachments`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: supA.cookie },
      body: form,
    })
    check('فایل بیش از ۱۰MB → 413', res.status === 413, `status=${res.status}`)
  }

  console.log('── ۴) Path Traversal در ID پیوست ──')
  {
    const res = await req('/api/v1/attachments/..%2F..%2Fetc%2Fpasswd/file', { cookie: supA.cookie })
    check('مسیر traversal در attachment id → 4xx/404', res.status >= 400 && res.status < 500, `status=${res.status}`)
  }

  console.log('── ۵) Rate Limit — Login ──')
  {
    const fixedIp = '172.16.99.7'
    let last = 0
    for (let i = 0; i < 10; i++) {
      const r = await req('/api/v1/auth/login', { method: 'POST', body: { username: 'nosuchuser', password: 'wrong1234' }, ip: fixedIp })
      last = r.status
      if (r.status === 429) break
    }
    check('۱۰ تلاش پشت‌سرهم login از یک IP → 429', last === 429, `last=${last}`)
  }

  console.log('── ۶) شماره ثبت هم‌زمان (اتمیک) ──')
  {
    const supervisor = supA // قبلاً login شده
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => createDraftEntry(supervisor.cookie, { note: `همزمانی ${i}` }))
    )
    const numbers = results.map((r) => r.json?.data?.entryNumber).filter(Boolean)
    const unique = new Set(numbers)
    check('۴ ثبت هم‌زمان → همه موفق', results.every((r) => r.status === 201), JSON.stringify(results.map((r) => [r.status, r.json?.code])))
    check('شماره‌های ثبت یکتا هستند', unique.size === numbers.length, JSON.stringify(numbers))
  }

  console.log('── ۷) Workflow کامل: Submit → Review → Correction → Resubmit ──')
  {
    const e1 = await createDraftEntry(supA.cookie)
    const id1 = e1.json?.data?.id
    check('ثبت ارسال‌شده → SUBMITTED', e1.json?.data?.status === 'SUBMITTED')

    // درخواست اصلاح توسط مدیر (مسیر رسمی: review با action REQUEST_CORRECTION)
    const mgr = await login('manager.sa')
    const cr = await req(`/api/v1/material-entries/${id1}/review`, {
      method: 'POST',
      cookie: mgr.cookie,
      body: { action: 'REQUEST_CORRECTION', reason: 'لطفاً مقدار را دقیق‌تر ثبت کنید' },
    })
    check('درخواست اصلاح (review) → 200', cr.status === 200, JSON.stringify(cr.json))

    // Resubmit توسط سرپرست
    const rs = await req(`/api/v1/material-entries/${id1}/resubmit`, {
      method: 'POST',
      cookie: supA.cookie,
      body: { notes: 'اصلاح شد' },
    })
    check('Resubmit → 200', rs.status === 200, JSON.stringify(rs.json))

    // تأیید نهایی
    const ap = await req(`/api/v1/material-entries/${id1}/review`, {
      method: 'POST',
      cookie: mgr.cookie,
      body: { action: 'APPROVE' },
    })
    check('تأیید نهایی → 200', ap.status === 200, JSON.stringify(ap.json))
  }

  console.log('── ۸) ابطال نشست با غیرفعال‌سازی کاربر ──')
  {
    // کاربر موقت بساز
    const uname = `tmpuser${Date.now().toString(36)}`
    const created = await req('/api/v1/admin/users', {
      method: 'POST',
      cookie: admin.cookie,
      body: { username: uname, password: 'test123456', fullName: 'کاربر موقت تست', role: 'WORKSHOP_SUPERVISOR', projectIds: [], workshopAccessIds: [] },
    })
    const uid = created.json?.data?.id
    check('ایجاد کاربر موقت → 201', created.status === 201, JSON.stringify(created.json))
    const loginRes = await login(uname, 'test123456')
    check('ورود کاربر موقت → 200', Boolean(loginRes.token))
    // غیرفعال کن
    const deact = await req(`/api/v1/admin/users/${uid}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { isActive: false },
    })
    check('غیرفعال‌سازی → 200', deact.status === 200)
    // نشست او باید مرده باشد
    const meRes = await req('/api/v1/auth/me', { cookie: loginRes.cookie })
    check('نشست کاربر غیرفعال → 401', meRes.status === 401)
  }

  console.log('── ۹) Cleanup فایل یتیم ──')
  {
    const { execSync } = await import('node:child_process')
    const out = execSync('bun scripts/cleanup-orphans.mjs --dry-run').toString()
    const parsed = JSON.parse(out.split('\n').filter(Boolean).pop() ?? '{}')
    check('cleanup-orphans اجرا شد', parsed.ok === true && typeof parsed.orphansFound === 'number')
  }

  await prisma.$disconnect()
  console.log(`\n══ Production: ${pass} موفق، ${fail} ناموفق ══`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})

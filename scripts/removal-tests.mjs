/**
 * گارد حذف ماژول‌ها — تضمین بازنگشتن مالی/حسابداری و صوت
 * + مجموعهٔ ۶ نقشی و غیرفعال‌بودن حساب‌های حذف‌شده
 */
const BASE = 'http://localhost:3000'
let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${detail}`) }
}
async function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' }
  if (cookie) headers['Cookie'] = cookie
  const safeMethod = method.toUpperCase()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body && safeMethod !== 'GET' && safeMethod !== 'HEAD' ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}
async function login(username, password = '123456') {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const raw = res.headers.get('set-cookie') ?? ''
  const token = /smi_session=([^;]+)/.exec(raw)?.[1]
  return { status: res.status, cookie: token ? `smi_session=${token}` : null }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function loginSpaced(username, password = '123456') {
  await sleep(8000) // احترام به محدودیت نرخ ورود (۸ در دقیقه)
  return login(username, password)
}

async function main() {
  console.log('── ۱) حذف ماژول مالی — نقاط پایانی نباید وجود داشته باشند ──')
  const admin = await login('admin')
  check('ورود مدیر سیستم', admin.status === 200 && admin.cookie)

  const endpoints = [
    ['/api/v1/finance/summary', 'GET'],
    ['/api/v1/finance/payments', 'GET'],
    ['/api/v1/finance/receivables', 'GET'],
    ['/api/v1/purchase-requests/whatever/payment-info', 'PATCH'],
  ]
  for (const [ep, m] of endpoints) {
    const r = await req(ep, { method: m, cookie: admin.cookie, body: {} })
    check(`${m} ${ep} حذف شده`, r.status === 404 || r.status === 405, `got=${r.status}`)
  }

  console.log('── ۲) حذف ماژول صوت — نقاط پایانی نباید وجود داشته باشند ──')
  const voiceRoutes = [
    ['/api/v1/voice/transcribe', 'POST'],
    ['/api/v1/voice/extract', 'POST'],
    ['/api/v1/daily-tasks/extract-items', 'POST'],
    ['/api/v1/daily-tasks/audio', 'POST'],
    ['/api/v1/daily-reports/audio', 'POST'],
  ]
  for (const [ep, m] of voiceRoutes) {
    const r = await req(ep, { method: m, cookie: admin.cookie, body: {} })
    check(`${m} ${ep} حذف شده`, r.status === 404 || r.status === 405, `got=${r.status}`)
  }
  const audioFile = await fetch(`${BASE}/api/v1/daily-audio/whatever/file`)
  check('GET /api/v1/daily-audio/[id]/file حذف شده', [404, 405].includes(audioFile.status), `got=${audioFile.status}`)

  console.log('── ۳) حساب‌های نقش‌های حذف‌شده غیرفعال‌اند ──')
  for (const u of ['accountant.sa', 'purchaser.sa', 'inspector.sa', 'viewer.sa']) {
    const r = await loginSpaced(u)
    check(`ورود ${u} مسدود است`, r.status === 401 || r.status === 403, `got=${r.status}`)
  }

  console.log('── ۴) مجموعهٔ ۳ نقشی ──')
  const roles = {}
  for (const u of ['manager.sa', 'supervisor.sa', 'warehouse.sa', 'worker.sa']) {
    const r = await loginSpaced(u)
    if (!r.cookie) { check(`ورود ${u}`, false, `got=${r.status}`); continue }
    const me = await req('/api/v1/auth/me', { cookie: r.cookie })
    roles[u] = me.json?.data?.user?.role
  }
  const adminMe = await req('/api/v1/auth/me', { cookie: admin.cookie })
  roles['admin'] = adminMe.json?.data?.user?.role
  check('admin → PROJECT_MANAGER', roles['admin'] === 'PROJECT_MANAGER')
  check('manager.sa → PROJECT_MANAGER', roles['manager.sa'] === 'PROJECT_MANAGER')
  check('supervisor.sa → SITE_SUPERVISOR', roles['supervisor.sa'] === 'SITE_SUPERVISOR')
  check('warehouse.sa → SITE_SUPERVISOR (وظایف انبار)', roles['warehouse.sa'] === 'SITE_SUPERVISOR')
  check('worker.sa → FIELD_WORKER', roles['worker.sa'] === 'FIELD_WORKER')

  // حساب‌های زائد نقش‌های حذف‌شده باید پاک شده باشند — ورود ناموفق
  const legacy = await loginSpaced('accountant.sa')
  check('حساب حسابدار حذف شده (ورود ناموفق)', !legacy.cookie, `got=${legacy.status}`)

  console.log('── ۵) کارگر ایزوله است ──')
  const worker = await loginSpaced('worker.sa')
  const wkMe = await req('/api/v1/auth/me', { cookie: worker.cookie })
  const wkPerms = wkMe.json?.data?.permissions ?? []
  check('کارگر فقط workreport و task.view دارد', wkPerms.length > 0 && wkPerms.every((p) => ['workreport.view', 'workreport.create', 'task.view'].includes(p)), JSON.stringify(wkPerms))
  check('کارگر مجوز entry.create ندارد', !wkPerms.includes('entry.create'))
  check('کارگر مجوز statement.view ندارد', !wkPerms.includes('statement.view'))
  check('کارگر مجوز finance.view ندارد', !wkPerms.includes('finance.view'))
  const tasks = await req('/api/v1/daily-tasks?pageSize=10', { cookie: worker.cookie })
  if (tasks.status === 200) {
    const list = tasks.json?.data?.tasks ?? []
    const myId = wkMe.json?.data?.user?.id
    const allMine = list.every((t) => (t.assignees ?? []).some((a) => a.id === myId))
    check('لیست وظایف کارگر فقط شامل وظایف خودش است', allMine || list.length === 0, JSON.stringify(list.slice(0, 2)))
  } else {
    check('دسترسی وظایف کارگر', tasks.status === 200, `got=${tasks.status}`)
  }

  console.log(`═══ نتیجه: ${pass} موفق، ${fail} ناموفق ═══`)
  process.exit(fail > 0 ? 1 : 0)
}

main()

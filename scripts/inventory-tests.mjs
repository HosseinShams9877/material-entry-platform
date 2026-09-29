// E2E انبار: ثبت ورود → ارسال → تأیید مدیر → تأیید انبار → بررسی افزایش موجودی
/**
 * سوئیت انبار — گردش کامل: ثبت ورود → ارسال → تأیید مدیر → تأیید انبار → افزایش موجودی
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
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
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
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status} ${await res.text()}`)
  const raw = res.headers.get('set-cookie') ?? ''
  return `smi_session=${/smi_session=([^;]+)/.exec(raw)?.[1]}`
}

const sup = await login('supervisor.sa')
const mgr = await login('manager.sa')
const wh = await login('warehouse.sa')

const md = await req('/api/v1/master', { cookie: sup })
const workshops = md.json?.data?.workshops ?? []
const materials = md.json?.data?.materials ?? []
const suppliers = md.json?.data?.suppliers ?? []
const projects = md.json?.data?.projects ?? []
const whA = workshops[0]
const mat = materials.find((m) => m.workshopId === whA.id) ?? materials[0]
const supA = suppliers[0]
const prjA = projects.find((p) => p.workshopId === whA.id)
console.log('workshop:', whA?.name, '| material:', mat?.name, '| project:', prjA?.name)

// موجودی فعلی همین ماده
const stocksBefore = await req(`/api/v1/inventory?workshopId=${whA.id}`, { cookie: wh })
const QTY = 7
const before = stocksBefore.json?.data?.stocks?.find((s) => s.materialName === mat.name)?.quantity ?? 0
console.log('stock before:', before)

// ایجاد ثبت
const created = await req('/api/v1/material-entries', {
  method: 'POST',
  cookie: sup,
  body: {
    type: 'PURCHASE',
    workshopId: whA.id,
    sourceType: 'SUPPLIER',
    sourceSupplierId: supA?.id ?? null,
    hasInvoice: false,
    items: [{ materialId: mat.id, materialName: mat.name, quantity: QTY, unit: mat.defaultUnit ?? 'عدد' }],
    projectIds: prjA ? [prjA.id] : [],
    workerIds: [],
  },
})
check('ایجاد ثبت ورود → 201', created.status === 201)
const entryId = created.json?.data?.entryId ?? created.json?.data?.id
if (!entryId) {
  console.log(`  ❌ شناسهٔ ثبت برگردانده نشد ${JSON.stringify(created.json)}`)
  process.exit(1)
}

// ارسال برای بررسی
const submit = await req(`/api/v1/material-entries/${entryId}/submit`, { method: 'POST', cookie: sup })
check('ارسال برای بررسی → 200', submit.status === 200)

// تأیید مدیر
const review = await req(`/api/v1/material-entries/${entryId}/review`, { method: 'POST', cookie: mgr, body: { action: 'APPROVE' } })
check('تأیید مدیر → 200', review.status === 200)

// تأیید انبار
const confirm = await req(`/api/v1/material-entries/${entryId}/warehouse-confirm`, { method: 'POST', cookie: wh, body: {} })
check('تأیید انبار → 200', confirm.status === 200, JSON.stringify(confirm.json))

// بررسی موجودی پس از تأیید
const stocksAfter = await req(`/api/v1/inventory?workshopId=${whA.id}`, { cookie: wh })
const after = stocksAfter.json?.data?.stocks?.find((s) => s.materialName === mat.name)?.quantity ?? 0
console.log('stock after:', after)

check(`موجودی دقیقاً ${QTY} واحد افزایش یافت (${before} → ${after})`, after === before + QTY)
console.log(`═══ نتیجه: ${pass} موفق، ${fail} ناموفق ═══`)
process.exit(fail > 0 ? 1 : 0)

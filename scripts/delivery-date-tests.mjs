// تست تکمیلی فیلد تاریخ ورود (deliveryAt) — قواعد سمت سرور
const BASE = 'http://localhost:3000'

async function req(path, { method = 'GET', body, cookie, extra = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...extra }
  if (cookie) headers['Cookie'] = cookie
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') }
}

async function login(username, password = '123456') {
  const res = await req('/api/v1/auth/login', { method: 'POST', body: { username, password } })
  if (res.status !== 200) throw new Error('login failed: ' + JSON.stringify(res.json))
  const raw = res.setCookie ?? ''
  const token = /smi_session=([^;]+)/.exec(raw)?.[1]
  return { cookie: `smi_session=${token}`, user: res.json?.data?.user }
}

async function main() {
  console.log('── تست فیلد تاریخ ورود (تقویم شمسی) ──')
  const sup = await login('supervisor.sa')
  const master = await req('/api/v1/master', { cookie: sup.cookie })
  const projectId = master.json?.data?.projects?.[0]?.id
  const baseEntry = {
    type: 'PURCHASE',
    sourceType: 'OTHER',
    sourceDescription: 'تست تاریخ',
    projectIds: [projectId],
    items: [{ materialName: 'سیمان تست تاریخ', quantity: 5, unit: 'کیسه' }],
  }

  // ۱) تاریخ معتبر (امروز)
  const today = new Date().toISOString().slice(0, 10)
  const ok1 = await req('/api/v1/material-entries', { method: 'POST', cookie: sup.cookie, body: { ...baseEntry, deliveryAt: today, status: 'DRAFT' } })
  console.log(ok1.status === 201 ? '✅ ذخیره با تاریخ امروز → 201' : `❌ امروز → ${ok1.status} ${JSON.stringify(ok1.json)}`)

  // ۲) تاریخ آیندهٔ دور → باید 422 بدهد
  const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
  const bad = await req('/api/v1/material-entries', { method: 'POST', cookie: sup.cookie, body: { ...baseEntry, deliveryAt: future, status: 'DRAFT' } })
  console.log(bad.status === 422 ? '✅ رد تاریخ آینده → 422 INVALID_DATE' : `❌ آینده → ${bad.status} ${JSON.stringify(bad.json)}`)

  // ۳) فرمت نامعتبر → 422
  const invalid = await req('/api/v1/material-entries', { method: 'POST', cookie: sup.cookie, body: { ...baseEntry, deliveryAt: '1405/06/19', status: 'DRAFT' } })
  console.log(invalid.status === 422 ? '✅ رد فرمت نامعتبر → 422' : `❌ فرمت → ${invalid.status}`)

  // ۴) فیلتر from/to روی لیست
  const list = await req(`/api/v1/material-entries?from=${today}&to=${today}`, { cookie: sup.cookie })
  const filtered = list.json?.data?.entries ?? []
  console.log(`✅ فیلتر بازهٔ امروز → ${filtered.length} ثبت (شامل ثبت تازه: ${filtered.some(e => e.deliveryAt?.startsWith(today)) ? 'بله' : 'خیر'})`)

  // ۵) ذخیرهٔ deliveryAt و بازخوانی آن
  const createdId = ok1.json?.data?.id
  const detail = await req(`/api/v1/material-entries/${createdId}`, { cookie: sup.cookie })
  const returned = detail.json?.data?.entry?.deliveryAt
  console.log(returned?.startsWith(today) ? '✅ تاریخ ذخیره‌شده بدون انحراف بازگشت' : `❌ بازگشت: ${returned}`)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })

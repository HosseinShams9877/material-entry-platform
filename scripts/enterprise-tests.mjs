#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// Enterprise Upgrade Tests — زنجیرهٔ کامل Workflow، RBAC نقش‌های جدید،
// Rollback، Idempotency، عکس اثبات، Versioning فایل، KPI داشبورد،
// کانال‌های اعلان (Delivery Log)، Session Hardening
// اجرا: bun scripts/enterprise-tests.mjs
// ══════════════════════════════════════════════════════════════════

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const PASSWORD = '123456'

let passed = 0
let failed = 0
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name} ${detail}`)
  }
}
function section(title) {
  console.log(`── ${title} ──`)
}

async function login(username) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ username, password: PASSWORD }),
  })
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error(`login failed for ${username}: ${JSON.stringify(await res.json().catch(() => ({})))}`)
  return cookie
}

async function req(path, { method = 'GET', cookie, body, ua, raw } = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest', ...(cookie ? { cookie } : {}) }
  if (ua) headers['user-agent'] = ua
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* binary */
  }
  return { status: res.status, json, headers: res.headers }
}

async function getProjectId(cookie) {
  const master = await req('/api/v1/master', { cookie })
  return master.json.data.projects[0].id
}

async function createEntry(cookie, status = 'DRAFT', clientRequestId) {
  const projectId = await getProjectId(cookie)
  const body = {
    type: 'PURCHASE',
    sourceType: 'SUPPLIER',
    projectIds: [projectId],
    items: [{ materialName: 'سیمان تیپ دو', quantity: 10, unit: 'کیسه' }],
    workers: [],
    hasInvoice: false,
    status,
  }
  if (clientRequestId) body.clientRequestId = clientRequestId
  return req('/api/v1/material-entries', { method: 'POST', cookie, body })
}

// ══════════════════════════════════════════════════════════════════

async function main() {
  console.log(`═══ Enterprise Tests — ${BASE} ═══`)

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const admin = await login('admin')
  await sleep(2500)
  const manager = await login('manager.sa')
  await sleep(2500)
  const supervisor = await login('supervisor.sa')
  await sleep(2500)
  const warehouse = await login('warehouse.sa')
  await sleep(2500)
  const inspector = await login('inspector.sa')
  await sleep(2500)
  const viewer = await login('viewer.sa')
  await sleep(2500)
  const supDa = await login('supervisor.da')

  // ── ۱) RBAC نقش‌های جدید ──
  section('۱) RBAC — نقش‌های جدید')
  {
    const whMe = await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: warehouse } }).then((r) => r.json())
    check('انباردار /me موفق', whMe?.data?.user?.role === 'WAREHOUSE_MANAGER')
    const insMe = await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: inspector } }).then((r) => r.json())
    check('ناظر /me موفق', insMe?.data?.user?.role === 'INSPECTOR')
    const viMe = await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: viewer } }).then((r) => r.json())
    check('بیننده /me موفق', viMe?.data?.user?.role === 'VIEWER')

    const createRes = await createEntry(viewer)
    check('بیننده → ایجاد ثبت ممنوع (403)', createRes.status === 403, `got ${createRes.status}`)
    const createRes2 = await createEntry(warehouse)
    check('انباردار → ایجاد ثبت ممنوع (403)', createRes2.status === 403, `got ${createRes2.status}`)
    const listRes = await req('/api/v1/material-entries', { cookie: viewer })
    check('بیننده → مشاهده لیست (scope کارگاه خودش)', listRes.status === 200)
    const daEntry = (listRes.json?.data?.entries ?? []).find((e) => e.workshopName?.includes('دروس') || e.workshopName?.includes('دوروس'))
    if (daEntry) {
      const xScope = await req(`/api/v1/material-entries/${daEntry.id}`, { cookie: viewer })
      check('بیننده → جزئیات ثبت کارگاه دیگر (404)', xScope.status === 404, `got ${xScope.status}`)
    } else {
      check('بیننده → هیچ ثبت کارگاه دروس در scope نیست', true)
    }
  }

  // ── ۲) زنجیرهٔ کامل Workflow ──
  section('۲) زنجیرهٔ کامل Workflow — بررسی فنی → تأیید → انبار → تحویل → بستن')
  let entryId = null
  {
    const create = await createEntry(supervisor, 'SUBMITTED')
    check('ایجاد + ارسال ثبت', create.status === 201 && create.json?.data?.status === 'SUBMITTED', JSON.stringify(create.json))
    entryId = create.json?.data?.id

    const detail0 = await req(`/api/v1/material-entries/${entryId}`, { cookie: inspector })
    check('ناظر سعادت‌آباد ثبت را می‌بیند', detail0.status === 200)
    check('canTechReview فعال برای ناظر', detail0.json?.data?.entry?.canTechReview === true)

    const start = await req(`/api/v1/material-entries/${entryId}/tech-review`, { method: 'POST', cookie: inspector, body: { action: 'START' } })
    check('شروع بررسی فنی → TECH_REVIEW', start.json?.data?.status === 'TECH_REVIEW', JSON.stringify(start.json))

    const complete = await req(`/api/v1/material-entries/${entryId}/tech-review`, { method: 'POST', cookie: inspector, body: { action: 'COMPLETE', note: 'مقادیر فنی صحیح است' } })
    check('پایان بررسی فنی → TECH_REVIEWED', complete.json?.data?.status === 'TECH_REVIEWED', JSON.stringify(complete.json))

    const approve = await req(`/api/v1/material-entries/${entryId}/review`, { method: 'POST', cookie: manager, body: { action: 'APPROVE', reason: 'تأیید شد' } })
    check('تأیید مدیر → APPROVED', approve.json?.data?.status === 'APPROVED', JSON.stringify(approve.json))

    const whBySupervisor = await req(`/api/v1/material-entries/${entryId}/warehouse-confirm`, { method: 'POST', cookie: supervisor, body: {} })
    check('سرپرست → تأیید انبار ممنوع (403)', whBySupervisor.status === 403, `got ${whBySupervisor.status}`)

    const wh = await req(`/api/v1/material-entries/${entryId}/warehouse-confirm`, { method: 'POST', cookie: warehouse, body: { note: 'موجودی کافی است' } })
    check('تأیید انبار → WAREHOUSE_CONFIRMED', wh.json?.data?.status === 'WAREHOUSE_CONFIRMED', JSON.stringify(wh.json))

    const deliver = await req(`/api/v1/material-entries/${entryId}/deliver`, { method: 'POST', cookie: warehouse, body: { note: 'تحویل راننده' } })
    check('تحویل → DELIVERED', deliver.json?.data?.status === 'DELIVERED', JSON.stringify(deliver.json))

    const closeByWarehouse = await req(`/api/v1/material-entries/${entryId}/close`, { method: 'POST', cookie: warehouse, body: {} })
    check('انباردار → بستن ممنوع (403)', closeByWarehouse.status === 403, `got ${closeByWarehouse.status}`)

    const close = await req(`/api/v1/material-entries/${entryId}/close`, { method: 'POST', cookie: manager, body: { note: 'بستن پرونده' } })
    check('بستن → CLOSED', close.json?.data?.status === 'CLOSED', JSON.stringify(close.json))

    const detail = await req(`/api/v1/material-entries/${entryId}`, { cookie: admin })
    const logs = detail.json?.data?.entry?.stageLogs ?? []
    check('تاریخچهٔ مراحل کامل', logs.length >= 6, `got ${logs.length}`)
    const actions = logs.map((l) => l.action)
    check('ترتیب Actions صحیح', actions.includes('SUBMIT') && actions.includes('TECH_REVIEW_START') && actions.includes('TECH_REVIEW_COMPLETE') && actions.includes('APPROVE') && actions.includes('WAREHOUSE_CONFIRM') && actions.includes('DELIVER') && actions.includes('CLOSE'), actions.join(','))
    const actorNames = logs.map((l) => l.actor?.fullName).filter(Boolean)
    check('انجام‌دهندهٔ هر مرحله ثبت شده', actorNames.length >= 6, `got ${actorNames.length}`)
  }

  // ── ۳) Rollback ──
  section('۳) برگشت مرحله (Rollback)')
  {
    const rb = await req(`/api/v1/material-entries/${entryId}/rollback`, { method: 'POST', cookie: admin, body: { reason: 'اشتباه در ثبت تحویل' } })
    check('بستن → تحویل برگشت', rb.json?.data?.status === 'DELIVERED', JSON.stringify(rb.json))

    const rb2 = await req(`/api/v1/material-entries/${entryId}/rollback`, { method: 'POST', cookie: manager, body: { reason: 'بررسی مجدد' } })
    check('تحویل → تأیید انبار برگشت', rb2.json?.data?.status === 'WAREHOUSE_CONFIRMED', JSON.stringify(rb2.json))

    const rbSup = await req(`/api/v1/material-entries/${entryId}/rollback`, { method: 'POST', cookie: supervisor, body: {} })
    check('سرپرست → Rollback ممنوع (403)', rbSup.status === 403, `got ${rbSup.status}`)

    // ثبت مجدد مراحل برای اطمینان از سلامت
    const reDeliver = await req(`/api/v1/material-entries/${entryId}/deliver`, { method: 'POST', cookie: warehouse, body: {} })
    check('تحویل مجدد پس از Rollback', reDeliver.json?.data?.status === 'DELIVERED', JSON.stringify(reDeliver.json))

    const detail = await req(`/api/v1/material-entries/${entryId}`, { cookie: admin })
    const rollbacks = (detail.json?.data?.entry?.stageLogs ?? []).filter((l) => l.action === 'ROLLBACK')
    check('رکوردهای ROLLBACK در تاریخچه', rollbacks.length === 2, `got ${rollbacks.length}`)
  }

  // ── ۴) Idempotency (ضدتکرار) ──
  section('۴) Idempotency — clientRequestId')
  {
    const crid = crypto.randomUUID()
    const first = await createEntry(supervisor, 'DRAFT', crid)
    check('ایجاد اول با clientRequestId → 201', first.status === 201, `got ${first.status}`)
    const second = await createEntry(supervisor, 'DRAFT', crid)
    check('ایجاد دوم با همان ID → duplicate (200)', second.status === 200 && second.json?.data?.duplicate === true, JSON.stringify(second.json))
    check('هر دو پاسخ به یک رکورد اشاره می‌کنند', first.json?.data?.id === second.json?.data?.id)
    const third = await createEntry(supDa, 'DRAFT', crid)
    check('همان ID توسط کاربر دیگر → 409 CONFLICT', third.status === 409, `got ${third.status}`)

    const cridR = crypto.randomUUID()
    const projectId = await getProjectId(supervisor)
    const repBody = {
      projectId,
      workshopId: (await req('/api/v1/master', { cookie: supervisor })).json.data.workshops[0].id,
      reportDate: new Date().toISOString().slice(0, 10),
      title: 'گزارش آزمایشی idempotent',
      content: 'متن گزارش آزمایشی برای بررسی Idempotency',
      clientRequestId: cridR,
    }
    const r1 = await req('/api/v1/daily-reports', { method: 'POST', cookie: supervisor, body: repBody })
    check('گزارش اول با clientRequestId → 201', r1.status === 201, `got ${r1.status}`)
    const r2 = await req('/api/v1/daily-reports', { method: 'POST', cookie: supervisor, body: repBody })
    check('گزارش دوم با همان ID → duplicate (200)', r2.status === 200 && r2.json?.data?.duplicate === true, JSON.stringify(r2.json))
  }

  // ── ۵) عکس اثبات انجام ──
  section('۵) عکس اثبات انجام آیتم وظیفه')
  {
    // ایجاد وظیفه — مجوز task.create فقط مدیر کارگاه/ادمین است؛ اینجا ادمین
    // کارگاه/پروژهٔ سعادت‌آباد (مطابق کارگاه سرپرست) برای ارسال به او
    const mdSup = await req('/api/v1/master', { cookie: supervisor })
    const whSA = (mdSup.json?.data?.workshops ?? []).find((w) => w.name.includes('سعادت'))
    const prjSA = (mdSup.json?.data?.projects ?? []).find((p) => p.name.includes('سعادت') && !p.name.includes('فاز')) ?? (mdSup.json?.data?.projects ?? [])[0]
    const taskRes = await req('/api/v1/daily-tasks', {
      method: 'POST',
      cookie: admin,
      body: {
        projectId: prjSA.id,
        workshopId: whSA.id,
        title: 'وظیفهٔ آزمایش عکس',
        items: [{ title: 'گزارش عکسی از بلوک‌ها' }],
        assignedDate: new Date().toISOString().slice(0, 10),
        priority: 'MEDIUM',
      },
    })
    check('ایجاد وظیفه توسط ادمین', taskRes.status === 201 || taskRes.status === 200, `got ${taskRes.status}`)
    const taskId = taskRes.json?.data?.taskId
    const meSup = await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: supervisor } }).then((r) => r.json())
    const supId = meSup?.data?.user?.id
    const sendRes = await req(`/api/v1/daily-tasks/${taskId}/send`, { method: 'POST', cookie: admin, body: { assigneeIds: [supId] } })
    check('ارسال وظیفه', sendRes.status === 200 || sendRes.status === 201, `got ${sendRes.status} ${JSON.stringify(sendRes.json)}`)
    const detail = await req(`/api/v1/daily-tasks/${taskId}`, { cookie: supervisor })
    const item = detail.json?.data?.task?.items?.[0]
    check('آیتم وظیفه موجود', !!item?.id)

    // PNG یک‌بایتی معتبر — بایت‌های واقعی PNG
    const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const pngBytes = Buffer.from(pngB64, 'base64')
    const fd = new FormData()
    fd.append('file', new Blob([pngBytes], { type: 'image/png' }), 'proof.png')
    const up = await fetch(`${BASE}/api/v1/daily-tasks/items/${item.id}/photo`, {
      method: 'POST',
      headers: { cookie: supervisor, 'X-Requested-With': 'XMLHttpRequest' },
      body: fd,
    })
    const upJson = await up.json().catch(() => ({}))
    check('آپلود عکس اثبات → 201', up.status === 201, `got ${up.status} ${JSON.stringify(upJson)}`)
    const photoId = upJson?.data?.photoId

    const exefb = new FormData()
    exefb.append('file', new Blob([Buffer.from('MZ\x90\x00fakeexe')], { type: 'image/png' }), 'evil.png')
    const upExe = await fetch(`${BASE}/api/v1/daily-tasks/items/${item.id}/photo`, {
      method: 'POST',
      headers: { cookie: supervisor, 'X-Requested-With': 'XMLHttpRequest' },
      body: exefb,
    })
    check('فایل جعلی EXE با MIME تصویر → 415', upExe.status === 415, `got ${upExe.status}`)

    const upOther = await fetch(`${BASE}/api/v1/daily-tasks/items/${item.id}/photo`, {
      method: 'POST',
      headers: { cookie: supDa, 'X-Requested-With': 'XMLHttpRequest' },
      body: (() => {
        const f = new FormData()
        f.append('file', new Blob([pngBytes], { type: 'image/png' }), 'x.png')
        return f
      })(),
    })
    check('سرپرست کارگاه دیگر → آپلود ممنوع (404)', upOther.status === 404, `got ${upOther.status}`)

    const img = await fetch(`${BASE}/api/v1/daily-photos/${photoId}/file`, { headers: { cookie: supervisor } })
    check('سرو عکس با نشست دارای Scope → 200', img.status === 200, `got ${img.status}`)
    const imgForeign = await fetch(`${BASE}/api/v1/daily-photos/${photoId}/file`, { headers: { cookie: supDa } })
    check('سرو عکس توسط کارگاه دیگر → 404', imgForeign.status === 404, `got ${imgForeign.status}`)
    const imgAnon = await fetch(`${BASE}/api/v1/daily-photos/${photoId}/file`)
    check('سرو عکس بدون نشست → 404', imgAnon.status === 404, `got ${imgAnon.status}`)

    const taskAfter = await req(`/api/v1/daily-tasks/${taskId}`, { cookie: admin })
    const photos = taskAfter.json?.data?.task?.items?.[0]?.photos ?? []
    check('عکس در جزئیات وظیفه با Metadata', photos.length === 1 && photos[0].uploadedByName && photos[0].createdAt, JSON.stringify(photos))
  }

  // ── ۶) Versioning فایل پیوست ──
  section('۶) Versioning فایل پیوست')
  {
    const create = await createEntry(supervisor, 'DRAFT')
    const entryIdV = create.json?.data?.id
    const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const pngBytes = Buffer.from(pngB64, 'base64')

    const up = (blob, name) => {
      const f = new FormData()
      f.append('file', blob, name)
      f.append('entryId', entryIdV)
      f.append('kind', 'INVOICE')
      return fetch(`${BASE}/api/v1/attachments`, {
        method: 'POST',
        headers: { cookie: supervisor, 'X-Requested-With': 'XMLHttpRequest' },
        body: f,
      })
    }
    const v1 = await up(new Blob([pngBytes], { type: 'image/png' }), 'invoice.png')
    check('آپلود نسخهٔ ۱ → 201', v1.status === 201, `got ${v1.status}`)
    const v1Json = await v1.json().catch(() => ({}))

    const upV = (blob, name, parent) => {
      const f = new FormData()
      f.append('file', blob, name)
      return fetch(`${BASE}/api/v1/attachments/${parent}/version`, {
        method: 'POST',
        headers: { cookie: supervisor, 'X-Requested-With': 'XMLHttpRequest' },
        body: f,
      })
    }
    const v2 = await upV(new Blob([pngBytes], { type: 'image/png' }), 'invoice-v2.png', v1Json?.data?.id)
    const v2Json = await v2.json().catch(() => ({}))
    check('آپلود نسخهٔ ۲ → 201', v2.status === 201 && v2Json?.data?.version === 2, `got ${v2.status} ${JSON.stringify(v2Json)}`)

    const v3 = await upV(new Blob([pngBytes], { type: 'image/png' }), 'invoice-v3.png', v1Json?.data?.id)
    check('جایگزینی نسخهٔ قدیمی → 409 SUPERSEDED', v3.status === 409, `got ${v3.status}`)

    const list = await req(`/api/v1/attachments?entryId=${entryIdV}`, { cookie: supervisor })
    check('هر دو نسخه در لیست', (list.json?.data?.attachments ?? []).length === 2, JSON.stringify(list.json?.data))
  }

  // ── ۷) KPI داشبورد ──
  section('۷) KPI و نمودارهای داشبورد')
  {
    const dash = await req('/api/v1/dashboard', { cookie: manager })
    const d = dash.json?.data
    check('داشبورد → 200', dash.status === 200)
    check('KPI میانگین تأیید موجود', d?.kpis && 'avgApprovalMinutes' in d.kpis, JSON.stringify(d?.kpis))
    check('KPI تأخیر/وظایف/گزارش موجود', d?.kpis && 'delayedCount' in d.kpis && 'openTasks' in d.kpis && 'reportsToday' in d.kpis)
    check('روند ۱۴ روزه کامل', Array.isArray(d?.trend) && d.trend.length === 14, `got ${d?.trend?.length}`)
    check('عملکرد سرپرستان', Array.isArray(d?.supervisorPerformance), `got ${typeof d?.supervisorPerformance}`)
    check('تفکیک کارگاه', Array.isArray(d?.byWorkshop), `got ${typeof d?.byWorkshop}`)
  }

  // ── ۸) کانال‌های اعلان / Delivery Log ──
  section('۸) اعلان‌ها و Delivery Log')
  {
    const create = await createEntry(supervisor, 'SUBMITTED')
    const eid = create.json?.data?.id
    await req(`/api/v1/material-entries/${eid}/review`, { method: 'POST', cookie: manager, body: { action: 'APPROVE' } })
    // Delivery log بدون Webhook = رکوردی ساخته نمی‌شود (کانال‌ها پیکربندی نشده) — رفتار صحیح:
    // در In-App اعلان ثبت می‌شود. تست: اعلان ENTRY_APPROVED برای سرپرست موجود است.
    const notifs = await req('/api/v1/notifications?unread=1', { cookie: supervisor })
    const items = notifs.json?.data?.notifications ?? notifs.json?.data?.items ?? []
    const hasApproved = items.some((n) => n.type === 'ENTRY_APPROVED')
    check('اعلان تأیید برای سرپرست ثبت شده', hasApproved, JSON.stringify(items.slice(0, 2)))
  }

  // ── ۹) Session Hardening ──
  section('۹) Session — اتصال UA و تمدید لغزان')
  {
    // ورود با UA مشخص — با Retry روی Rate Limit
    const uaLogin = 'EnterpriseTestUA/1.0'
    let cookie = ''
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'user-agent': uaLogin },
        body: JSON.stringify({ username: 'supervisor.da', password: PASSWORD }),
      })
      cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
      if (cookie && res.status === 200) break
      await sleep(5000)
    }
    const okReq = await req('/api/v1/auth/me', { cookie, ua: uaLogin })
    check('درخواست با UA یکسان → 200', okReq.status === 200, `got ${okReq.status}`)

    const hijack = await req('/api/v1/auth/me', { cookie, ua: 'Hijacker/9.0' })
    check('درخواست با UA متفاوت → 401 (نشست باطل شد)', hijack.status === 401, `got ${hijack.status}`)
  }

  // ── ۱۰) Backup ──
  section('۱۰) پشتیبان‌گیری')
  {
    const { spawnSync } = await import('node:child_process')
    const { existsSync, readdirSync, rmSync } = await import('node:fs')
    const backupDir = '/home/z/my-project/backups'
    try {
      rmSync(backupDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    const r = spawnSync('node', ['scripts/db-backup.mjs'], { cwd: '/home/z/my-project', encoding: 'utf8' })
    const files = existsSync(backupDir) ? readdirSync(backupDir) : []
    check('اسکریپت Backup موفق و فایل ساخته شد', r.status === 0 && files.some((f) => f.endsWith('.db')), r.stderr?.slice(0, 200))
    if (files.length) {
      for (const f of files) rmSync(`${backupDir}/${f}`)
    }
  }

  console.log(`═══ نتیجه: ${passed} موفق، ${failed} ناموفق ═══`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('fatal:', e)
  process.exit(1)
})

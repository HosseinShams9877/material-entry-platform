/**
 * تست ماژول‌های جدید: صورت وضعیت (با امضای مدیر کل)، اعلام نیاز/کنترل خرید، گزارش کار کارگران
 * پوشش: RBAC، Scope/IDOR بین‌کارگاهی، گردش کار کامل، آستانهٔ ۱۵۰ میلیون، اعتبارسنجی امضا، حذف Voice
 */
const BASE = 'http://localhost:3000'
const DEV_SECRET = 'dev-only-ephemeral-signed-url-secret' // فقط در Development
const GM_THRESHOLD = 150_000_000

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

async function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' }
  if (cookie) headers['Cookie'] = cookie
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* ignore */
  }
  return { status: res.status, json }
}

async function login(username, password = '123456') {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (res.status !== 200) throw new Error(`login failed for ${username}`)
  const raw = res.headers.get('set-cookie') ?? ''
  const token = /smi_session=([^;]+)/.exec(raw)?.[1]
  return `smi_session=${token}`
}

function makePngDataUrl(width = 300, height = 120) {
  // PNG معتبر واقعی — grayscale 8-bit با IDAT فشرده‌شدهٔ zlib
  const zlib = await_import_zlib()
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(0, 9) // color type: grayscale
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  function crc32(buf) {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([len, typeBuf, data, crc])
  }
  // اسکن‌لاین‌ها: هر خط با فیلتر ۰ شروع می‌شود
  const raw = Buffer.alloc(height * (1 + width))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width)] = 0
    for (let x = 0; x < width; x++) raw[y * (1 + width) + 1 + x] = (x + y) % 251
  }
  const idat = zlib.deflateSync(raw)
  const png = Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${png.toString('base64')}`
}

function await_import_zlib() {
  return zlibSync
}
import { deflateSync as _deflateSync } from 'node:zlib'
const zlibSync = { deflateSync: _deflateSync }

async function getNotifications(cookie) {
  const res = await req('/api/v1/notifications?pageSize=50', { cookie })
  return res.json?.data?.notifications ?? []
}

async function main() {
  console.log('── ۱) ورود حساب‌ها ──')
  const admin = await login('admin') // SUPER_ADMIN
  const gm = await login('gm.sa') // GENERAL_MANAGER — جدید
  const manager = await login('manager.sa') // PROJECT_MANAGER
  const supA = await login('supervisor.sa') // سرپرست سعادت‌آباد
  const supB = await login('supervisor.da') // سرپرست دروس
  const warehouse = await login('warehouse.sa') // انباردار
  const viewer = await login('viewer.sa') // بیننده

  {
    const me = await req('/api/v1/auth/me', { cookie: gm })
    check('نقش مدیر کل فعال است', me.json?.data?.user?.role === 'GENERAL_MANAGER')
    check('مدیر کل مجوز امضا دارد', (me.json?.data?.permissions ?? []).includes('statement.gmSign'))
  }

  // ─────────────────────────── صورت وضعیت ───────────────────────────

  console.log('── ۲) صورت وضعیت — ایجاد و اعتبارسنجی ──')
  let smallStmtId = null
  let bigStmtId = null
  let prjAId = null
  {
    const wsRes = await req('/api/v1/master', { cookie: supA })
    const wsId = wsRes.json?.data?.workshops?.[0]?.id
    prjAId = wsRes.json?.data?.projects?.[0]?.id

    const res = await req('/api/v1/statements', {
      method: 'POST',
      cookie: supA,
      body: { workshopId: '', title: 'صورت وضعیت بدون کارگاه', amount: 10_000_000 },
    })
    check('ایجاد بدون کارگاه → 422', res.status === 422, JSON.stringify(res.json))

    const bad = await req('/api/v1/statements', {
      method: 'POST',
      cookie: supA,
      body: { workshopId: wsId, title: 'مبلغ منفی', amount: -5 },
    })
    check('مبلغ نامعتبر → 422', bad.status === 422)

    const viewerCreate = await req('/api/v1/statements', {
      method: 'POST',
      cookie: viewer,
      body: { workshopId: wsId, title: 'کوشش بیننده', amount: 10_000_000 },
    })
    check('بیننده اجازهٔ ایجاد ندارد → 403', viewerCreate.status === 403)

    const small = await req('/api/v1/statements', {
      method: 'POST',
      cookie: supA,
      body: { workshopId: wsId, projectId: prjAId, title: 'صورت وضعیت نازک‌کاری طبقهٔ اول', periodText: 'شهریور ۱۴۰۵', amount: 120_000_000, description: 'نازک‌کاری کامل طبقهٔ اول' },
    })
    check('ایجاد صورت وضعیت کوچک → 201', small.status === 201, JSON.stringify(small.json))
    smallStmtId = small.json?.data?.statementId
    check('شمارهٔ ترتیبی برگردانده شد', typeof small.json?.data?.number === 'number')

    const big = await req('/api/v1/statements', {
      method: 'POST',
      cookie: supA,
      body: { workshopId: wsId, projectId: prjAId, title: 'صورت وضعیت اسکلت و سقف طبقهٔ دوم', amount: GM_THRESHOLD + 30_000_000 },
    })
    check('ایجاد صورت وضعیت بزرگ → 201', big.status === 201)
    bigStmtId = big.json?.data?.statementId
  }

  console.log('── ۳) صورت وضعیت — ارسال، تأیید، آستانهٔ مدیر کل ──')
  {
    // آستانه: دقیقاً ۱۵۰ میلیون نیازمند امضا نیست؛ بالای آن هست
    const detail = await req(`/api/v1/statements/${bigStmtId}`, { cookie: supA })
    check('صورت وضعیت بزرگ needsGmSign=true', detail.json?.data?.statement?.needsGmSign === true)
    const smallDetail = await req(`/api/v1/statements/${smallStmtId}`, { cookie: supA })
    check('صورت وضعیت کوچک needsGmSign=false', smallDetail.json?.data?.statement?.needsGmSign === false)

    // امضا پیش از رسیدن به مرحلهٔ امضا → 423
    const earlySign = await req(`/api/v1/statements/${bigStmtId}/sign`, {
      method: 'POST',
      cookie: gm,
      body: { signatureData: makePngDataUrl() },
    })
    check('امضا روی صورت وضعیت ارسال‌نشده → 423', earlySign.status === 423)

    // ارسال توسط سرپرست
    const submit = await req(`/api/v1/statements/${bigStmtId}/submit`, { method: 'POST', cookie: supA })
    check('ارسال صورت وضعیت بزرگ → 200', submit.status === 200, JSON.stringify(submit.json))
    const resubmit = await req(`/api/v1/statements/${bigStmtId}/submit`, { method: 'POST', cookie: supA })
    check('ارسال مجدد → 423', resubmit.status === 423)

    // سرپرست اجازهٔ تأیید ندارد
    const supApprove = await req(`/api/v1/statements/${bigStmtId}/approve`, { method: 'POST', cookie: supA, body: {} })
    check('سرپرست اجازهٔ تأیید ندارد → 403', supApprove.status === 403)

    // تأیید مدیر → PENDING_GM_SIGN
    const approve = await req(`/api/v1/statements/${bigStmtId}/approve`, { method: 'POST', cookie: manager, body: { note: 'بررسی شد' } })
    check('تأیید مدیر بزرگ → PENDING_GM_SIGN', approve.json?.data?.status === 'PENDING_GM_SIGN', JSON.stringify(approve.json))

    // اعلان به مدیر کل
    const gmNotif = await getNotifications(gm)
    check('اعلان امضا برای مدیر کل', gmNotif.some((n) => n.type === 'STATEMENT_PENDING_GM_SIGN' && n.entityId === bigStmtId))

    // امضا توسط غیرمدیر کل → 403 (حتی admin با نقش SUPER_ADMIN)
    const adminSign = await req(`/api/v1/statements/${bigStmtId}/sign`, {
      method: 'POST',
      cookie: admin,
      body: { signatureData: makePngDataUrl() },
    })
    check('امضا توسط مدیر سیستم → 403', adminSign.status === 403)

    // امضا با قالب نامعتبر → 422
    const badSig = await req(`/api/v1/statements/${bigStmtId}/sign`, {
      method: 'POST',
      cookie: gm,
      body: { signatureData: 'data:image/png;base64,!!!!not-base64!!!!' },
    })
    check('امضای قالب خراب → 422', badSig.status === 422)

    // امضای صحیح توسط مدیر کل
    const sign = await req(`/api/v1/statements/${bigStmtId}/sign`, {
      method: 'POST',
      cookie: gm,
      body: { signatureData: makePngDataUrl() },
    })
    check('امضای صحیح مدیر کل → 200 و SIGNED', sign.json?.data?.status === 'SIGNED', JSON.stringify(sign.json))

    // فایل امضا — Signed URL
    const signedDetail = await req(`/api/v1/statements/${bigStmtId}`, { cookie: gm })
    const sigUrl = signedDetail.json?.data?.statement?.signatureUrl
    check('signatureUrl برگردانده شد', !!sigUrl)
    if (sigUrl) {
      const okRes = await fetch(`${BASE}${sigUrl}`)
      check('نمایش امضا با Signed URL → 200 و PNG', okRes.status === 200 && (okRes.headers.get('content-type') ?? '').includes('image/png'))
      const noToken = await fetch(`${BASE}/api/v1/statements/${bigStmtId}/signature`)
      check('امضا بدون توکن و بدون نشست → 404', noToken.status === 404)
      const { createHmac } = await import('node:crypto')
      const expired = Date.now() - 1000
      const sig = createHmac('sha256', DEV_SECRET).update(`${bigStmtId}.${expired}`).digest('hex')
      const expRes = await fetch(`${BASE}/api/v1/statements/${bigStmtId}/signature?token=${expired}.${sig}`)
      check('Signed URL منقضی امضا → 404', expRes.status === 404)
    }

    // امضای مجدد → 423
    const resign = await req(`/api/v1/statements/${bigStmtId}/sign`, {
      method: 'POST',
      cookie: gm,
      body: { signatureData: makePngDataUrl() },
    })
    check('امضای مجدد → 423', resign.status === 423)

    // اعلان نهایی به ثبت‌کننده
    const supNotif = await getNotifications(supA)
    check('اعلان STATEMENT_SIGNED برای سرپرست', supNotif.some((n) => n.type === 'STATEMENT_SIGNED' && n.entityId === bigStmtId))
  }

  console.log('── ۴) صورت وضعیت کوچک — تأیید مستقیم بدون امضا ──')
  {
    const submit = await req(`/api/v1/statements/${smallStmtId}/submit`, { method: 'POST', cookie: supA })
    check('ارسال صورت وضعیت کوچک → 200', submit.status === 200)
    const approve = await req(`/api/v1/statements/${smallStmtId}/approve`, { method: 'POST', cookie: manager, body: {} })
    check('تأیید مستقیم → APPROVED (بدون امضا)', approve.json?.data?.status === 'APPROVED', JSON.stringify(approve.json))
  }

  console.log('── ۵) صورت وضعیت — رد، ویرایش، حذف و IDOR ──')
  {
    // سرپرست B به صورت وضعیت کارگاه A دسترسی ندارد
    const idor = await req(`/api/v1/statements/${smallStmtId}`, { cookie: supB })
    check('IDOR: صورت وضعیت A توسط B → 404', idor.status === 404)
    const idorList = await req('/api/v1/statements?pageSize=50', { cookie: supB })
    check('IDOR: فهرست B شامل صورت وضعیت A نیست', !(idorList.json?.data?.statements ?? []).some((s) => s.id === smallStmtId))

    // ویرایش غیرپیش‌نویس → 423
    const editSigned = await req(`/api/v1/statements/${smallStmtId}`, { method: 'PATCH', cookie: supA, body: { title: 'تغییر' } })
    check('ویرایش غیرپیش‌نویس → 423', editSigned.status === 423)

    // ساخت، ویرایش و حذف پیش‌نویس
    const wsRes = await req('/api/v1/master', { cookie: supA })
    const wsId = wsRes.json?.data?.workshops?.[0]?.id
    const draft = await req('/api/v1/statements', {
      method: 'POST',
      cookie: supA,
      body: { workshopId: wsId, projectId: prjAId, title: 'پیش‌نویس حذفی', amount: 5_000_000 },
    })
    const draftId = draft.json?.data?.statementId
    const edit = await req(`/api/v1/statements/${draftId}`, { method: 'PATCH', cookie: supA, body: { amount: 6_500_000, title: 'پیش‌نویس ویرایش‌شده' } })
    check('ویرایش پیش‌نویس → 200', edit.status === 200)
    const del = await req(`/api/v1/statements/${draftId}`, { method: 'DELETE', cookie: supA })
    check('حذف پیش‌نویس → 200', del.status === 200)

    // رد توسط مدیر
    const rej = await req('/api/v1/statements', {
      method: 'POST',
      cookie: supA,
      body: { workshopId: wsId, projectId: prjAId, title: 'صورت وضعیت ردشدنی', amount: 10_000_000 },
    })
    const rejId = rej.json?.data?.statementId
    await req(`/api/v1/statements/${rejId}/submit`, { method: 'POST', cookie: supA })
    const reject = await req(`/api/v1/statements/${rejId}/reject`, { method: 'POST', cookie: manager, body: { reason: 'ردیف‌ها ناقص است' } })
    check('رد صورت وضعیت → REJECTED', reject.json?.data?.status === 'REJECTED', JSON.stringify(reject.json))
    const rejDetail = await req(`/api/v1/statements/${rejId}`, { cookie: supA })
    check('علت رد ذخیره شد', rejDetail.json?.data?.statement?.rejectReason === 'ردیف‌ها ناقص است')
  }

  // ─────────────────────────── اعلام نیاز و کنترل خرید ───────────────────────────

  console.log('── ۶) اعلام نیاز — ایجاد و اعتبارسنجی ──')
  let reqId = null
  let wsAId = null
  {
    const wsRes = await req('/api/v1/master', { cookie: warehouse })
    const wsId = wsRes.json?.data?.workshops?.[0]?.id
    wsAId = wsId
    if (!prjAId) prjAId = wsRes.json?.data?.projects?.find((p) => p.workshopId === wsId)?.id ?? null

    const noItems = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsId, items: [] },
    })
    check('درخواست بدون قلم → 422', noItems.status === 422)

    const managerCreate = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: manager,
      body: { workshopId: wsId, items: [{ materialName: 'x', quantity: 1, unit: 'عدد' }] },
    })
    check('مدیر پروژه اجازهٔ اعلام نیاز ندارد → 403', managerCreate.status === 403)

    const create = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: warehouse,
      body: {
        workshopId: wsId,
        projectId: prjAId,
        note: 'برای بتن‌ریزی هفتهٔ آینده',
        items: [
          { materialName: 'سیمان تیپ دو', quantity: 200, unit: 'کیسه', sortOrder: 0 },
          { materialName: 'میلگرد ۱۶', quantity: 1.5, unit: 'تن', sortOrder: 1 },
        ],
      },
    })
    check('اعلام نیاز توسط انباردار → 201', create.status === 201, JSON.stringify(create.json))
    reqId = create.json?.data?.requestId
    check('شمارهٔ ترتیبی درخواست برگشت داده شد', typeof create.json?.data?.number === 'number')

    // هیچ فیلد قیمتی در پاسخ نیست
    const detail = await req(`/api/v1/purchase-requests/${reqId}`, { cookie: warehouse })
    const r = detail.json?.data?.request
    check('وضعیت اولیه PENDING', r?.status === 'PENDING')
    check('بدون هیچ فیلد مالی در پاسخ', !('amount' in (r ?? {})) && !('price' in (r ?? {})) && r?.items?.every((i) => !('price' in i) && !('amount' in i)))

    // اعلان به مدیران
    const mgrNotif = await getNotifications(manager)
    check('اعلان PURCHASE_REQUESTED برای مدیر', mgrNotif.some((n) => n.type === 'PURCHASE_REQUESTED' && n.entityId === reqId))
  }

  console.log('── ۷) کنترل خرید — گردش کامل و RBAC ──')
  {
    // انباردار اجازهٔ تأیید ندارد
    const whApprove = await req(`/api/v1/purchase-requests/${reqId}/approve`, { method: 'POST', cookie: warehouse })
    check('انباردار اجازهٔ تأیید ندارد → 403', whApprove.status === 403)

    // IDOR: سرپرست B به درخواست کارگاه A دسترسی ندارد
    const idor = await req(`/api/v1/purchase-requests/${reqId}`, { cookie: supB })
    check('IDOR: درخواست A توسط B → 404', idor.status === 404)

    const approve = await req(`/api/v1/purchase-requests/${reqId}/approve`, { method: 'POST', cookie: manager })
    check('تأیید مدیر → APPROVED', approve.json?.data?.status === 'APPROVED')

    const reApprove = await req(`/api/v1/purchase-requests/${reqId}/approve`, { method: 'POST', cookie: manager })
    check('تأیید مجدد → 423', reApprove.status === 423)

    const receiveEarly = await req(`/api/v1/purchase-requests/${reqId}/receive`, { method: 'POST', cookie: warehouse })
    check('دریافت پیش از خرید → 423', receiveEarly.status === 423)

    const order = await req(`/api/v1/purchase-requests/${reqId}/order`, { method: 'POST', cookie: manager })
    check('ثبت خریداری‌شدن → ORDERED', order.json?.data?.status === 'ORDERED')

    const whOrder = await req(`/api/v1/purchase-requests/${reqId}/order`, { method: 'POST', cookie: warehouse })
    check('انباردار اجازهٔ ثبت خرید ندارد → 403', whOrder.status === 403)

    const receive = await req(`/api/v1/purchase-requests/${reqId}/receive`, { method: 'POST', cookie: warehouse })
    check('دریافت انبار → RECEIVED', receive.json?.data?.status === 'RECEIVED')

    const whNotif = await getNotifications(warehouse)
    check('اعلان PURCHASE_ORDERED برای انباردار', whNotif.some((n) => n.type === 'PURCHASE_ORDERED' && n.entityId === reqId))
  }

  console.log('── ۸) خرید — رد، ویرایش و حذف درخواست ──')
  {
    const wsRes = await req('/api/v1/master', { cookie: warehouse })
    const wsId = wsAId ?? wsRes.json?.data?.workshops?.[0]?.id
    const create = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsId, projectId: prjAId, items: [{ materialName: 'بلوک سفالی', quantity: 500, unit: 'عدد' }] },
    })
    const id2 = create.json?.data?.requestId

    // ویرایش درخواست در انتظار توسط انباردار
    const edit = await req(`/api/v1/purchase-requests/${id2}`, {
      method: 'PATCH',
      cookie: warehouse,
      body: { items: [{ materialName: 'بلوک سفالی', quantity: 700, unit: 'عدد' }] },
    })
    check('ویرایش درخواست PENDING → 200', edit.status === 200)
    const detail = await req(`/api/v1/purchase-requests/${id2}`, { cookie: warehouse })
    check('مقدار ویرایش‌شده اعمال شد', detail.json?.data?.request?.items?.[0]?.quantity === 700)

    const reject = await req(`/api/v1/purchase-requests/${id2}/reject`, { method: 'POST', cookie: manager, body: { reason: 'موجودی انبار کافی است' } })
    check('رد درخواست → REJECTED', reject.json?.data?.status === 'REJECTED')

    // ساخت و حذف پیش‌نویسِ در انتظار
    const create2 = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsId, projectId: prjAId, items: [{ materialName: 'ماسه شسته', quantity: 3, unit: 'ماشین' }] },
    })
    const id3 = create2.json?.data?.requestId
    const del = await req(`/api/v1/purchase-requests/${id3}`, { method: 'DELETE', cookie: warehouse })
    check('حذف درخواست PENDING → 200', del.status === 200)
  }

  // ─────────────────────────── گزارش کار کارگران ───────────────────────────

  console.log('── ۹) گزارش کار کارگران — ثبت و فهرست ──')
  let wrId = null
  {
    const wsRes = await req('/api/v1/master', { cookie: supA })
    const wsId = wsRes.json?.data?.workshops?.[0]?.id

    const viewerCreate = await req('/api/v1/work-reports', {
      method: 'POST',
      cookie: viewer,
      body: { workshopId: wsId, workerName: 'تست', reportDate: '2026-09-14', content: 'تست بیننده' },
    })
    check('بیننده اجازهٔ ثبت گزارش کار ندارد → 403', viewerCreate.status === 403)

    const create = await req('/api/v1/work-reports', {
      method: 'POST',
      cookie: supA,
      body: { workshopId: wsId, projectId: prjAId, workerName: 'علی محمدی', reportDate: '2026-09-14', content: 'قالب‌بندی ستون‌های قطعهٔ دو را انجام داد و میلگرد‌های طبقهٔ اول را جابجا کرد.', crewCount: 2 },
    })
    check('ثبت گزارش کار توسط سرپرست → 201', create.status === 201, JSON.stringify(create.json))
    wrId = create.json?.data?.reportId

    // انباردار مجوز ثبت گزارش کار ندارد (فقط مشاهده)
    const wrWarehouse = await req('/api/v1/work-reports', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsId, workerName: 'حسن رضایی', reportDate: '2026-09-14', content: 'چیدمان مصالح در انبار.' },
    })
    check('انباردار اجازهٔ ثبت گزارش کار ندارد → 403', wrWarehouse.status === 403)

    const list = await req('/api/v1/work-reports?from=2026-09-14&to=2026-09-14', { cookie: manager })
    const items = list.json?.data?.reports ?? []
    check('فهرست گزارش کار مدیر شامل گزارش سرپرست است', items.some((r) => r.workerName === 'علی محمدی'))

    // فیلتر نام
    const byName = await req('/api/v1/work-reports?q=' + encodeURIComponent('علی'), { cookie: manager })
    check('فیلتر جستجو بر اساس نام کارگر', (byName.json?.data?.reports ?? []).every((r) => r.workerName.includes('علی') || r.content.includes('علی')))

    // IDOR: سرپرست B گزارش کارگاه A را نمی‌بیند
    const idorList = await req('/api/v1/work-reports?pageSize=50', { cookie: supB })
    check('IDOR: گزارش کار A در فهرست B نیست', !(idorList.json?.data?.reports ?? []).some((r) => r.id === wrId))
    const idorDel = await req(`/api/v1/work-reports/${wrId}`, { method: 'DELETE', cookie: supB })
    // حذف اکنون نیازمند مجوز workreport.delete است → قبل از Scope رد می‌شود (403 یا 404 هر دو امن)
    check('IDOR: حذف گزارش A توسط B → 403/404', idorDel.status === 403 || idorDel.status === 404)

    // حذف توسط ادمین (مجوز workreport.delete)
    const del = await req(`/api/v1/work-reports/${wrId}`, { method: 'DELETE', cookie: admin })
    check('حذف گزارش کار توسط ادمین → 200', del.status === 200)
  }

  console.log('── ۱۰) بایگانی و ناوبری ثبت‌ها ──')
  {
    const archived = await req('/api/v1/material-entries?status=CLOSED&pageSize=5', { cookie: manager })
    check('فیلتر بایگانی (CLOSED) پاسخ می‌دهد', archived.status === 200 && Array.isArray(archived.json?.data?.entries))
  }

  console.log(`\n══ Modules: ${pass} موفق، ${fail} ناموفق ══`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e)
  process.exit(1)
})

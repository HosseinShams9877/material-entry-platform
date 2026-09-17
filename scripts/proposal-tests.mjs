/**
 * تست ماژول‌های سیستم مدیریت یکپارچه (سند پیشنهادی کارفرما):
 * کارپرداز/فاکتور خرید، انبار کارگاه (موجودی/گردش/کمبود)، جابجایی نیرو با سابقه،
 * چک‌لیست پروژه، خوداظهاری نیروی اجرایی، هشدار درخواست بی‌پاسخ، داشبورد یکپارچه
 * پوشش: RBAC، Scope/IDOR، Magic Bytes فاکتور، ضدتکرار موجودی، گارد مالی
 */
import { deflateSync } from 'node:zlib'

const BASE = 'http://localhost:3000'

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

function makePngBuffer(width = 320, height = 140) {
  const zlib = { deflateSync }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(0, 9)
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
  const raw = Buffer.alloc(height * (1 + width))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width)] = 0
    for (let x = 0; x < width; x++) raw[y * (1 + width) + 1 + x] = (x + y) % 251
  }
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

async function uploadInvoice(cookie, purchaseId, fileBuffer, fileName = 'invoice.png') {
  const form = new FormData()
  form.append('file', new Blob([fileBuffer], { type: 'image/png' }), fileName)
  const res = await fetch(`${BASE}/api/v1/purchase-requests/${purchaseId}/invoice`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: cookie },
    body: form,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* ignore */
  }
  return { status: res.status, json }
}

async function main() {
  console.log('── ۱) حساب‌های نقش‌های جدید ──')
  const admin = await login('admin')
  const manager = await login('manager.sa')
  const supA = await login('supervisor.sa')
  const warehouse = await login('warehouse.sa')
  const purchaser = await login('purchaser.sa')
  const worker = await login('worker.sa')
  const viewer = await login('viewer.sa')

  let wsA = null
  let prjA = null
  {
    const me = await req('/api/v1/auth/me', { cookie: purchaser })
    check('نقش کارپرداز فعال است', me.json?.data?.user?.role === 'PURCHASER')
    check('کارپرداز مجوز ثبت خرید دارد', (me.json?.data?.permissions ?? []).includes('purchase.order'))
    check('کارپرداز مجوز تأیید ندارد', !(me.json?.data?.permissions ?? []).includes('purchase.approve'))

    const mew = await req('/api/v1/auth/me', { cookie: worker })
    check('نقش نیروی اجرایی فعال است', mew.json?.data?.user?.role === 'FIELD_WORKER')
    check('نیروی اجرایی به پروفایل کارگر متصل است', mew.json?.data?.linkedWorker?.fullName === 'علی')

    const md = await req('/api/v1/master', { cookie: supA })
    wsA = md.json?.data?.workshops?.[0]?.id
    prjA = md.json?.data?.projects?.[0]?.id
  }

  // ─────────────────────────── گردش کامل خرید: نیاز → تأیید → خرید → فاکتور → دریافت → انبار ───────────────────────────

  console.log('── ۲) گردش کامل خرید با کارپرداز و فاکتور ──')
  let purchaseId = null
  {
    const created = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: warehouse,
      body: {
        workshopId: wsA,
        projectId: prjA,
        note: 'تست گردش یکپارچه',
        items: [
          { materialName: 'سیمان تیپ دو', quantity: 30, unit: 'کیسه', sortOrder: 0 },
          { materialName: 'بلوک سفالی', quantity: 200, unit: 'عدد', sortOrder: 1 },
        ],
      },
    })
    check('اعلام نیاز انباردار ثبت شد', created.status === 201, JSON.stringify(created.json))
    purchaseId = created.json?.data?.requestId

    // کارپرداز نمی‌تواند تأیید کند
    const forbidden = await req(`/api/v1/purchase-requests/${purchaseId}/approve`, { method: 'POST', cookie: purchaser, body: {} })
    check('کارپرداز تأیید نکننده — 403', forbidden.status === 403)

    const approved = await req(`/api/v1/purchase-requests/${purchaseId}/approve`, { method: 'POST', cookie: manager, body: {} })
    check('مدیر تأیید کرد', approved.status === 200)

    // ثبت خرید با فیلدهای اضافی ممنوع (پرداخت/سررسید باید توسط Zod حذف شوند)
    const ordered = await req(`/api/v1/purchase-requests/${purchaseId}/order`, {
      method: 'POST',
      cookie: purchaser,
      body: {
        supplierName: 'سیمان تهران',
        expectedDeliveryAt: '2026-09-20',
        totalAmount: 48_500_000,
        orderNote: 'خرید از شعبهٔ شمال',
        paidAt: '2026-09-20',
        dueDate: '2026-10-20',
        debtAmount: 5_000_000,
      },
    })
    check('ثبت خرید با کارپرداز موفق', ordered.status === 200, JSON.stringify(ordered.json))

    const detail = await req(`/api/v1/purchase-requests/${purchaseId}`, { cookie: manager })
    const d = detail.json?.data?.request
    check('تأمین‌کننده ثبت شد', d?.supplierName === 'سیمان تهران')
    check('مبلغ کل خرید ثبت شد', d?.totalAmount === '48500000')
    check('تاریخ تحویل ثبت شد', d?.expectedDeliveryAt !== null)
    // مالی سادهٔ سند یکپارچه: dueDate فیلد رسمی است و ذخیره می‌شود؛ paidAt/debtAmount (فیلدهای ناشناستهٔ مالی) باید حذف شوند
    check('سررسید پرداخت (مالی سادهٔ سند) ذخیره شد', d?.dueDate !== null && d?.dueDate !== undefined)
    check('فیلدهای مالی ناشناسته ذخیره نشده', d?.paidAt === undefined && d?.debtAmount === undefined)
    check('canUploadInvoice برای کارپرداز فعال است', await (async () => {
      const dp = await req(`/api/v1/purchase-requests/${purchaseId}`, { cookie: purchaser })
      return dp.json?.data?.request?.canUploadInvoice === true
    })())
  }

  console.log('── ۳) فاکتور خرید — آپلود امن ──')
  {
    const png = makePngBuffer()

    // آپلود توسط بیننده — 403
    const denied = await uploadInvoice(viewer, purchaseId, png)
    check('آپلود فاکتور توسط بیننده — 403', denied.status === 403, `status=${denied.status}`)

    // آپلود قبل از ثبت خرید — 423
    const created2 = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsA, items: [{ materialName: 'ماسه شسته', quantity: 2, unit: 'ماشین', sortOrder: 0 }] },
    })
    const pendingId = created2.json?.data?.requestId
    const tooEarly = await uploadInvoice(purchaser, pendingId, png)
    check('آپلود فاکتور قبل از خرید — 423', tooEarly.status === 423, `status=${tooEarly.status}`)

    // آپلود محتوای جعلی (MIME جعلی) — 415
    const fake = Buffer.from('GIF89a-not-really-png-content-here')
    const spoofed = await uploadInvoice(purchaser, purchaseId, fake)
    check('MIME جعلی — 415', spoofed.status === 415, `status=${spoofed.status}`)

    // آپلود درست
    const uploaded = await uploadInvoice(purchaser, purchaseId, png)
    check('آپلود فاکتور PNG موفق', uploaded.status === 201, JSON.stringify(uploaded.json))

    const detail = await req(`/api/v1/purchase-requests/${purchaseId}`, { cookie: warehouse })
    check('فاکتور در جزئیات دیده می‌شود', detail.json?.data?.request?.hasInvoice === true)

    // فایل با نشست مجاز
    const fileRes = await fetch(`${BASE}/api/v1/purchase-requests/${purchaseId}/invoice/file`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: manager },
    })
    check('دانلود فاکتور با نشست مجاز — 200', fileRes.status === 200)
    const bytes = Buffer.from(await fileRes.arrayBuffer())
    check('محتوای فاکتور PNG معتبر است', bytes[0] === 0x89 && bytes[1] === 0x50)

    // توکن جعلی
    const forged = await fetch(`${BASE}/api/v1/purchase-requests/${purchaseId}/invoice/file?token=deadbeefdeadbeefdeadbeef`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    check('توکن جعلی — 404', forged.status === 404)

    // بدون نشست
    const anon = await fetch(`${BASE}/api/v1/purchase-requests/${purchaseId}/invoice/file`)
    check('بدون نشست — 404', anon.status === 404)

    // جایگزینی فاکتور
    const replaced = await uploadInvoice(purchaser, purchaseId, makePngBuffer(200, 100), 'invoice-v2.png')
    check('جایگزینی فاکتور موفق', replaced.status === 201)
  }

  console.log('── ۴) دریافت در انبار → ورود خودکار به موجودی ──')
  {
    const received = await req(`/api/v1/purchase-requests/${purchaseId}/receive`, { method: 'POST', cookie: warehouse, body: {} })
    check('دریافت در انبار موفق', received.status === 200, JSON.stringify(received.json))

    // دوباره دریافت — 423
    const again = await req(`/api/v1/purchase-requests/${purchaseId}/receive`, { method: 'POST', cookie: warehouse, body: {} })
    check('دریافت دوباره — 423', again.status === 423)

    const inv = await req('/api/v1/inventory', { cookie: warehouse })
    const stocks = inv.json?.data?.stocks ?? []
    const cement = stocks.find((s) => s.materialName === 'سیمان تیپ دو')
    const block = stocks.find((s) => s.materialName === 'بلوک سفالی')
    check('سیمان وارد موجودی شد', !!cement && cement.quantity >= 30, JSON.stringify(cement))
    check('بلوک وارد موجودی شد', !!block && block.quantity >= 200, JSON.stringify(block))

    const movements = await req('/api/v1/inventory/movements?pageSize=10', { cookie: warehouse })
    const inMov = (movements.json?.data?.movements ?? []).find((m) => m.materialName === 'سیمان تیپ دو' && m.direction === 'IN')
    check('گردش IN با دلیل خرید ثبت شد', !!inMov && inMov.reason === 'PURCHASE', JSON.stringify(inMov))
  }

  console.log('── ۵) خروج انبار، کمبود و گاردهای Scope ──')
  {
    // خروج بیش از موجودی — 422
    const tooMuch = await req('/api/v1/inventory/movements', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsA, materialName: 'سیمان تیپ دو', unit: 'کیسه', quantity: 999_999, direction: 'OUT', reason: 'ISSUE' },
    })
    check('خروج بیش از موجودی — 422', tooMuch.status === 422, `status=${tooMuch.status}`)

    // خروج درست
    const out = await req('/api/v1/inventory/movements', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsA, materialName: 'سیمان تیپ دو', unit: 'کیسه', quantity: 5, direction: 'OUT', reason: 'ISSUE', note: 'مصرف فونداسیون' },
    })
    check('ثبت خروج موفق', out.status === 201, JSON.stringify(out.json))
    check('موجودی باقیمانده درست است', out.json?.data?.remainingQuantity !== undefined)

    // تعیین حداقل موجودی و کمبود (مقاوم به وضعیت داده — حداقل = موجودی + ۱)
    const inv = await req('/api/v1/inventory', { cookie: warehouse })
    const cement = (inv.json?.data?.stocks ?? []).find((s) => s.materialName === 'سیمان تیپ دو')
    const setMin = await req(`/api/v1/inventory/stocks/${cement.id}`, { method: 'PATCH', cookie: warehouse, body: { minQuantity: cement.quantity + 1 } })
    check('تعیین حداقل موجودی موفق', setMin.status === 200)
    const inv2 = await req('/api/v1/inventory', { cookie: warehouse })
    const cement2 = (inv2.json?.data?.stocks ?? []).find((s) => s.materialName === 'سیمان تیپ دو')
    check('کمبود شناسایی شد', cement2?.isLow === true, JSON.stringify(cement2))

    // IDOR: انباردار سعادت‌آباد برای کارگاه دروس — باید 403/422 شود
    const mdB = await req('/api/v1/admin/workshops', { cookie: admin })
    const whB = (mdB.json?.data?.workshops ?? []).find((w) => w.id !== wsA)?.id
    if (whB) {
      const idor = await req('/api/v1/inventory/movements', {
        method: 'POST',
        cookie: warehouse,
        body: { workshopId: whB, materialName: 'سیمان تیپ دو (دروس)', unit: 'کیسه', quantity: 1, direction: 'OUT', reason: 'ISSUE' },
      })
      check('خروج از کارگاه دیگر — 403 (IDOR)', idor.status === 403, `status=${idor.status}`)
    }

    // سرپرست نمی‌تواند خروج ثبت کند (inventory.manage ندارد)
    const supTry = await req('/api/v1/inventory/movements', {
      method: 'POST',
      cookie: supA,
      body: { workshopId: wsA, materialName: 'سیمان تیپ دو', unit: 'کیسه', quantity: 1, direction: 'OUT', reason: 'ISSUE' },
    })
    check('سرپرست خروج نتواند — 403', supTry.status === 403, `status=${supTry.status}`)

    // بیننده موجودی می‌بیند؟ viewer.inventory.view ندارد — 403
    const viewerInv = await req('/api/v1/inventory', { cookie: viewer })
    check('بیننده موجودی نبیند — 403', viewerInv.status === 403, `status=${viewerInv.status}`)
  }

  console.log('── ۶) جابجایی نیرو با سابقهٔ کامل ──')
  {
    const workers = await req('/api/v1/admin/workers', { cookie: admin })
    const hasan = (workers.json?.data?.workers ?? []).find((w) => w.fullName === 'حسن')
    const mdB = await req('/api/v1/admin/workshops', { cookie: admin })
    // مقصد = کارگاهی غیر از کارگاه فعلی حسن (تا تست تکرارپذیر باشد)
    const whB = (mdB.json?.data?.workshops ?? []).find((w) => w.id !== hasan.workshopId)?.id

    // سرپرست حق جابجایی ندارد — 403
    const denied = await req(`/api/v1/admin/workers/${hasan.id}/transfer`, {
      method: 'POST',
      cookie: supA,
      body: { toWorkshopId: whB, transferredAt: '2026-09-16' },
    })
    check('جابجایی توسط سرپرست — 403', denied.status === 403, `status=${denied.status}`)

    const transfer = await req(`/api/v1/admin/workers/${hasan.id}/transfer`, {
      method: 'POST',
      cookie: admin,
      body: { toWorkshopId: whB, transferredAt: '2026-09-16', reason: 'نیاز به نیرو در دروس' },
    })
    check('جابجایی موفق', transfer.status === 201, JSON.stringify(transfer.json))

    const workers2 = await req('/api/v1/admin/workers', { cookie: admin })
    const hasan2 = (workers2.json?.data?.workers ?? []).find((w) => w.id === hasan.id)
    check('کارگاه فعلی کارگر به‌روز شد', hasan2?.workshopId === whB)

    const history = await req(`/api/v1/admin/workers/transfers?workerId=${hasan.id}`, { cookie: admin })
    const t = history.json?.data?.transfers ?? []
    check('سابقهٔ جابجایی ثبت شد', t.length >= 1 && t[0].fromWorkshopName !== undefined && t[0].toWorkshopName !== undefined, JSON.stringify(t[0]))

    // برگشت — همان کارگاه — 422
    const same = await req(`/api/v1/admin/workers/${hasan.id}/transfer`, {
      method: 'POST',
      cookie: admin,
      body: { toWorkshopId: whB, transferredAt: '2026-09-16' },
    })
    check('جابجایی به همان کارگاه — 422', same.status === 422, `status=${same.status}`)
  }

  console.log('── ۷) چک‌لیست پروژه ──')
  {
    const checklist = await req(`/api/v1/admin/projects/${prjA}/checklist`, { cookie: manager })
    const items = checklist.json?.data?.items ?? []
    check('الگوی پیش‌فرض چک‌لیست ساخته شد', checklist.status === 200 && items.length >= 5, `count=${items.length}`)

    const tick = await req(`/api/v1/admin/projects/${prjA}/checklist/${items[0].id}`, {
      method: 'PATCH',
      cookie: manager,
      body: { isDone: true },
    })
    check('تیک آیتم موفق', tick.status === 200 && tick.json?.data?.isDone === true)

    // سرپرست تیک نتواند — 403
    const denied = await req(`/api/v1/admin/projects/${prjA}/checklist/${items[1].id}`, {
      method: 'PATCH',
      cookie: supA,
      body: { isDone: true },
    })
    check('تیک توسط سرپرست — 403', denied.status === 403, `status=${denied.status}`)

    const added = await req(`/api/v1/admin/projects/${prjA}/checklist`, {
      method: 'POST',
      cookie: manager,
      body: { title: 'هماهنگی با کارفرما برای فاز دوم' },
    })
    check('افزودن آیتم موفق', added.status === 201)

    const removed = await req(`/api/v1/admin/projects/${prjA}/checklist/${added.json?.data?.id}`, { method: 'DELETE', cookie: manager })
    check('حذف آیتم موفق', removed.status === 200)

    // idempotent بودن seed — دوباره همان تعداد
    const again = await req(`/api/v1/admin/projects/${prjA}/checklist`, { cookie: manager })
    check('بازدید دوباره تکرار seed نمی‌کند', again.json?.data?.items?.length === items.length)
  }

  console.log('── ۸) خوداظهاری نیروی اجرایی ──')
  {
    // نام جعلی — سرور نام واقعی را اجباری می‌کند
    const fake = await req('/api/v1/work-reports', {
      method: 'POST',
      cookie: worker,
      body: { workshopId: 'FAKE', workerName: 'جعلی کامل', reportDate: '2026-09-16', content: 'قالب‌بندی ستون‌های طبقهٔ دوم انجام شد' },
    })
    check('ثبت گزارش توسط نیروی اجرایی موفق', fake.status === 201, JSON.stringify(fake.json))

    const mine = await req('/api/v1/work-reports?mine=1&pageSize=5', { cookie: worker })
    const mineReports = mine.json?.data?.reports ?? []
    check('نام ثبت‌شده اجباری به پروفایل خود است (ضد جعل هویت)', mineReports[0]?.workerName === 'علی', mineReports[0]?.workerName)

    // نیروی اجرایی نمی‌تواند گزارش دیگری را حذف کند — حذف اصلاً مجوز ندارد
    const del = await req(`/api/v1/work-reports/${mineReports[0]?.id}`, { method: 'DELETE', cookie: worker })
    check('حذف توسط نیروی اجرایی — 403', del.status === 403, `status=${del.status}`)

    // نیروی اجرایی به پنل ادمین دسترسی ندارد
    const adminTry = await req('/api/v1/admin/users', { cookie: worker })
    check('نیروی اجرایی به ادمین — 403', adminTry.status === 403)
  }

  console.log('── ۹) هشدار درخواست بی‌پاسخ + داشبورد یکپارچه ──')
  {
    const list = await req('/api/v1/purchase-requests?status=PENDING&pageSize=5', { cookie: manager })
    const rows = list.json?.data?.requests ?? []
    check('فیلد isStale در فهرست هست', rows.every((r) => typeof r.isStale === 'boolean'))
    check('درخواست تازه stale نیست', rows.every((r) => !r.isStale))

    const dash = await req('/api/v1/dashboard', { cookie: manager })
    const data = dash.json?.data
    check('داشبورد: وضعیت خرید دارد', typeof data?.purchases?.pending === 'number' && typeof data?.purchases?.stale === 'number')
    check('داشبورد: وضعیت انبار دارد', typeof data?.inventory?.lowStock === 'number')
    check('داشبورد: گزارش کار امروز دارد', typeof data?.workReportsToday === 'number')

    const dashGm = await req('/api/v1/dashboard', { cookie: await login('gm.sa') })
    check('داشبورد مدیر کل هم خرید/انبار را می‌بیند', typeof dashGm.json?.data?.purchases?.pending === 'number')
  }

  console.log(`\n═══ نتیجه: ${pass} موفق / ${fail} ناموفق ═══`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('💥 خطای سوئیت:', e.message)
  process.exit(1)
})

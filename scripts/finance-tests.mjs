/**
 * تست فاز مالی ساده (پرداخت/سررسید/بدهی) و ارزیابی/KPI — طبق سند PDF «سیستم مدیریت یکپارچه»
 * پوشش: RBAC نقش حسابدار، Scope/IDOR، ثبت پرداخت با کنترل سقف بدهی، تسویه،
 * طلب (دریافت) و وصول، هشدار سررسید گذشته، KPI نیروها (هدف/درصد تحقق)، داشبورد مالی
 */
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

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

async function main() {
  console.log('── ۱) نقش حسابدار و RBAC مالی ──')
  const admin = await login('admin')
  const gm = await login('gm.sa')
  const manager = await login('manager.sa')
  const accountant = await login('accountant.sa')
  const warehouse = await login('warehouse.sa')
  const supervisor = await login('supervisor.sa')
  const purchaser = await login('purchaser.sa')
  const worker = await login('worker.sa')

  let wsA = null
  let prjA = null
  {
    const me = await req('/api/v1/auth/me', { cookie: accountant })
    check('حساب حسابدار فعال است', me.json?.data?.user?.role === 'ACCOUNTANT')
    check('حسابدار مجوز ثبت پرداخت دارد', (me.json?.data?.permissions ?? []).includes('finance.manage'))
    check('حسابدار مجوز مشاهده مالی دارد', (me.json?.data?.permissions ?? []).includes('finance.view'))
    check('حسابدار مجوز تأیید خرید ندارد', !(me.json?.data?.permissions ?? []).includes('purchase.approve'))
    check('حسابدار مجوز ثبت ورود مصالح ندارد', !(me.json?.data?.permissions ?? []).includes('entry.create'))

    const md = await req('/api/v1/master', { cookie: warehouse })
    wsA = md.json?.data?.workshops?.[0]?.id
    prjA = md.json?.data?.projects?.[0]?.id ?? null
  }

  console.log('── ۲) گردش خرید تا مرحلهٔ پرداخت ──')
  let purchaseId = null
  const TOTAL = 30_000_000
  let basePaidTotal = '0'
  {
    const created = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: warehouse,
      body: {
        workshopId: wsA,
        projectId: prjA,
        note: 'تست مالی ساده',
        items: [{ materialName: 'میلگرد ۱۴', quantity: 3, unit: 'تن', sortOrder: 0 }],
      },
    })
    check('اعلام نیاز ثبت شد', created.status === 201, JSON.stringify(created.json))
    purchaseId = created.json?.data?.requestId

    const approved = await req(`/api/v1/purchase-requests/${purchaseId}/approve`, { method: 'POST', cookie: manager, body: {} })
    check('تأیید مدیر پروژه موفق', approved.status === 200)

    const ordered = await req(`/api/v1/purchase-requests/${purchaseId}/order`, {
      method: 'POST',
      cookie: purchaser,
      body: {
        supplierName: 'آهن‌آلات مرکزی',
        totalAmount: TOTAL,
        dueDate: '2026-10-01',
        paymentTerms: '۵۰٪ هنگام خرید، مابقی بعد از تحویل',
      },
    })
    check('ثبت خرید با سررسید و شرایط پرداخت موفق', ordered.status === 200, JSON.stringify(ordered.json))

    const detail = await req(`/api/v1/purchase-requests/${purchaseId}`, { cookie: accountant })
    const d = detail.json?.data?.request
    check('سررسید و شرایط در جزئیات دیده می‌شود', d?.dueDate !== null && d?.paymentTerms?.includes('۵۰٪') === true)
    check('وضعیت اولیه: پرداخت‌نشده', d?.payment?.paymentStatus === 'UNPAID', JSON.stringify(d?.payment))
    check('مانده اولیه برابر مبلغ کل', d?.payment?.remainingAmount === String(TOTAL))

    // مبنا برای مقایسهٔ دلتایی (مقاوم به دادهٔ نمایشی موجود)
    const baseSummary = await req('/api/v1/finance/summary', { cookie: accountant })
    basePaidTotal = baseSummary.json?.data?.totals?.paidTotal ?? '0'
  }

  console.log('── ۳) ثبت پرداخت — مجوزها و کنترل سقف بدهی ──')
  {
    // انباردار مجوز مالی ندارد — 403
    const denied = await req('/api/v1/finance/payments', {
      method: 'POST',
      cookie: warehouse,
      body: { purchaseId, amount: 1_000_000, paidAt: todayISO(), method: 'CASH' },
    })
    check('ثبت پرداخت توسط انباردار — 403', denied.status === 403, `status=${denied.status}`)

    // سرپرست مجوز مالی ندارد — 403
    const denied2 = await req('/api/v1/finance/payments', {
      method: 'POST',
      cookie: supervisor,
      body: { purchaseId, amount: 1_000_000, paidAt: todayISO() },
    })
    check('ثبت پرداخت توسط سرپرست — 403', denied2.status === 403)

    // مبلغ صفر — 400/422
    const zero = await req('/api/v1/finance/payments', {
      method: 'POST',
      cookie: accountant,
      body: { purchaseId, amount: 0, paidAt: todayISO() },
    })
    check('مبلغ صفر رد می‌شود', zero.status === 400 || zero.status === 422, `status=${zero.status}`)

    // مبلغ بیش از بدهی — 422
    const overpay = await req('/api/v1/finance/payments', {
      method: 'POST',
      cookie: accountant,
      body: { purchaseId, amount: TOTAL + 1, paidAt: todayISO() },
    })
    check('پرداخت بیش از بدهی — 422', overpay.status === 422, `status=${overpay.status} ${JSON.stringify(overpay.json)}`)

    // خرید بی‌موجود — 404
    const ghost = await req('/api/v1/finance/payments', {
      method: 'POST',
      cookie: accountant,
      body: { purchaseId: 'nonexistent-id', amount: 1_000_000, paidAt: todayISO() },
    })
    check('خرید ناموجود — 404', ghost.status === 404)

    // پرداخت جزئی توسط حسابدار
    const pay1 = await req('/api/v1/finance/payments', {
      method: 'POST',
      cookie: accountant,
      body: { purchaseId, amount: 10_000_000, paidAt: todayISO(), method: 'TRANSFER', referenceNo: 'TRX-101' },
    })
    check('پرداخت جزئی حسابدار موفق', pay1.status === 201, JSON.stringify(pay1.json))
    check('پس از پرداخت جزئی: مانده ۲۰ میلیون', pay1.json?.data?.remainingAmount === '20000000')
    check('پس از پرداخت جزئی: وضعیت PARTIAL', pay1.json?.data?.paymentStatus === 'PARTIAL')

    // پرداخت توسط مدیر کل (نیز مجاز)
    const pay2 = await req('/api/v1/finance/payments', {
      method: 'POST',
      cookie: gm,
      body: { purchaseId, amount: 20_000_000, paidAt: todayISO(), method: 'CHECK' },
    })
    check('پرداخت تکمیلی مدیر کل موفق', pay2.status === 201, JSON.stringify(pay2.json))
    check('تسویه کامل', pay2.json?.data?.paymentStatus === 'PAID' && pay2.json?.data?.remainingAmount === '0')

    // پرداخت روی خریدِ تسویه‌شده — 422
    const settled = await req('/api/v1/finance/payments', {
      method: 'POST',
      cookie: accountant,
      body: { purchaseId, amount: 1_000, paidAt: todayISO() },
    })
    check('پرداخت روی خرید تسویه‌شده — 422', settled.status === 422, `status=${settled.status}`)

    // دفتر پرداخت‌ها
    const list = await req(`/api/v1/finance/payments?purchaseId=${purchaseId}`, { cookie: accountant })
    check('دفتر پرداخت‌ها دو ردیف دارد', list.json?.data?.payments?.length === 2, JSON.stringify(list.json?.data?.payments?.length))
  }

  console.log('── ۴) خلاصهٔ مالی و هشدار سررسید گذشته ──')
  {
    const summary = await req('/api/v1/finance/summary', { cookie: accountant })
    check('خلاصهٔ مالی برای حسابدار 200', summary.status === 200)
    check('مجموع پرداخت‌ها = مبنا + مبلغ تست', summary.json?.data?.totals?.paidTotal === (BigInt(basePaidTotal) + BigInt(TOTAL)).toString(), `paid=${summary.json?.data?.totals?.paidTotal} base=${basePaidTotal}`)
    check('خرید تست در بدهی‌ها نیست (تسویه‌شده)', !(summary.json?.data?.debts ?? []).some((x) => x.id === purchaseId))

    // خرید با سررسید گذشته و بدون پرداخت → باید در overdue ظاهر شود
    const created2 = await req('/api/v1/purchase-requests', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsA, items: [{ materialName: 'سیمان تیپ دو', quantity: 10, unit: 'کیسه', sortOrder: 0 }] },
    })
    check('ایجاد خرید دوم موفق', created2.status === 201, JSON.stringify(created2.json))
    const pid2 = created2.json?.data?.requestId
    // خرید دوم بدون پروژه است → مدیر پروژه‌محور عمداً به آن دسترسی ندارد (رفتار صحیح Scope)؛ تأیید با ادمین سراسری
    const ap2 = await req(`/api/v1/purchase-requests/${pid2}/approve`, { method: 'POST', cookie: admin, body: {} })
    check('تأیید خرید دوم (ادمین) موفق', ap2.status === 200, JSON.stringify(ap2.json))
    const pmDenied = await req(`/api/v1/purchase-requests/${pid2}`, { cookie: manager })
    check('خرید بدون پروژه برای مدیر پروژه‌محور نامرئی است', pmDenied.status === 404)
    const or2 = await req(`/api/v1/purchase-requests/${pid2}/order`, {
      method: 'POST',
      cookie: purchaser,
      body: { supplierName: 'تأمین گذشته', totalAmount: 5_000_000, dueDate: '2026-01-01' },
    })
    check('ثبت خرید دوم با سررسید گذشته موفق', or2.status === 200, JSON.stringify(or2.json))

    const summary2 = await req('/api/v1/finance/summary', { cookie: gm })
    const overdueRow = (summary2.json?.data?.overdue ?? []).find((x) => x.id === pid2)
    check('خرید با سررسید گذشته در هشدارها ظاهر می‌شود', overdueRow != null, JSON.stringify(summary2.json?.data?.overdue?.length))
    check('ماندهٔ سررسیدگذشته درست است', overdueRow?.remainingAmount === '5000000')
    check('شمارندهٔ overdue بزرگ‌تر از صفر است', (summary2.json?.data?.totals?.overdueCount ?? 0) >= 1)

    // دسترسی سرپرست به خلاصهٔ مالی — 403
    const deniedSummary = await req('/api/v1/finance/summary', { cookie: supervisor })
    check('خلاصهٔ مالی برای سرپرست — 403', deniedSummary.status === 403, `status=${deniedSummary.status}`)

    // داشبورد مدیر کل شامل بلوک مالی
    const dash = await req('/api/v1/dashboard', { cookie: gm })
    check('داشبورد مدیر کل بلوک مالی دارد', dash.json?.data?.finance != null && dash.json?.data?.finance?.debtTotal != null)
    const dashSup = await req('/api/v1/dashboard', { cookie: supervisor })
    check('داشبورد سرپرست بلوک مالی ندارد', dashSup.json?.data?.finance === undefined || dashSup.json?.data?.finance === null)

    // ویرایش سررسید توسط حسابدار
    const patched = await req(`/api/v1/purchase-requests/${pid2}/payment-info`, {
      method: 'PATCH',
      cookie: accountant,
      body: { dueDate: '2026-12-29', paymentTerms: 'چک سه‌ماهه' },
    })
    check('ویرایش سررسید توسط حسابدار موفق', patched.status === 200, JSON.stringify(patched.json))
    const after = await req(`/api/v1/finance/summary`, { cookie: gm })
    const stillOverdue = (after.json?.data?.overdue ?? []).some((x) => x.id === pid2)
    check('پس از تمدید سررسید، از هشدار خارج شد', !stillOverdue)
    // انباردار اجازهٔ ویرایش سررسید ندارد
    const patchDenied = await req(`/api/v1/purchase-requests/${pid2}/payment-info`, {
      method: 'PATCH',
      cookie: warehouse,
      body: { dueDate: '2026-01-01' },
    })
    check('ویرایش سررسید توسط انباردار — 403', patchDenied.status === 403, `status=${patchDenied.status}`)
  }

  console.log('── ۵) طلب از کارفرما (دریافت‌ها) ──')
  {
    // انباردار مجوز ندارد — 403
    const denied = await req('/api/v1/finance/receivables', {
      method: 'POST',
      cookie: warehouse,
      body: { workshopId: wsA, title: 'طلب تست انباردار', amount: 1_000_000 },
    })
    check('ثبت طلب توسط انباردار — 403', denied.status === 403)

    const created = await req('/api/v1/finance/receivables', {
      method: 'POST',
      cookie: accountant,
      body: { workshopId: wsA, projectId: prjA, title: 'صورت وضعیت شمارهٔ ۵ پروژهٔ سعادت‌آباد', amount: 850_000_000, dueDate: '2026-11-15' },
    })
    check('ثبت طلب توسط حسابدار موفق', created.status === 201, JSON.stringify(created.json))
    const receivableId = created.json?.data?.receivableId

    const list = await req('/api/v1/finance/receivables', { cookie: gm })
    const row = (list.json?.data?.receivables ?? []).find((r) => r.id === receivableId)
    check('طلب در فهرست مدیر کل دیده می‌شود', row != null)
    check('وضعیت اولیه طلب: باز', row?.status === 'OPEN')

    // وصول طلب
    const settled = await req(`/api/v1/finance/receivables/${receivableId}`, {
      method: 'PATCH',
      cookie: accountant,
      body: { status: 'SETTLED' },
    })
    check('وصول طلب موفق', settled.status === 200 && settled.json?.data?.status === 'SETTLED')

    // بازگشایی
    const reopened = await req(`/api/v1/finance/receivables/${receivableId}`, {
      method: 'PATCH',
      cookie: gm,
      body: { status: 'OPEN' },
    })
    check('بازگشایی طلب توسط مدیر کل موفق', reopened.status === 200 && reopened.json?.data?.status === 'OPEN')

    // خلاصه: طلب باز
    const summary = await req('/api/v1/finance/summary', { cookie: accountant })
    check('طلب باز در خلاصهٔ مالی محاسبه شد', summary.json?.data?.totals?.receivablesOpenAmount === '850000000')

    // حذف طلب
    const del = await req(`/api/v1/finance/receivables/${receivableId}`, { method: 'DELETE', cookie: accountant })
    check('حذف طلب موفق', del.status === 200)
    const del2 = await req(`/api/v1/finance/receivables/${receivableId}`, { method: 'PATCH', cookie: accountant, body: { status: 'SETTLED' } })
    check('طلب حذف‌شده دیگر قابل تغییر نیست — 404', del2.status === 404)
  }

  console.log('── ۶) ارزیابی و KPI نیروها ──')
  {
    // مجوزها
    const deniedPerf = await req('/api/v1/performance', { cookie: worker })
    check('صفحهٔ ارزیابی برای نیروی اجرایی — 403', deniedPerf.status === 403, `status=${deniedPerf.status}`)

    // گزارش کار برای علی (کارگر متصل به worker.sa) — توسط سرپرست
    const workers = await req('/api/v1/admin/workers', { cookie: admin })
    const ali = (workers.json?.data?.workers ?? []).find((w) => w.fullName === 'علی')
    check('کارگر «علی» یافت شد', ali != null)

    const today = todayISO()
    const monthNow = new Date().toISOString().slice(0, 7)
    // شمارش پایه برای مقاوم‌سازی تست در برابر دادهٔ قبلی
    const perfBase = await req(`/api/v1/performance?month=${monthNow}`, { cookie: gm })
    const aliBase = (perfBase.json?.data?.workers ?? []).find((w) => w.workerId === ali?.id)
    const baseReports = aliBase?.reportsCount ?? 0
    const baseCrew = aliBase?.crewSum ?? 0

    for (let i = 0; i < 3; i++) {
      const rep = await req('/api/v1/work-reports', {
        method: 'POST',
        cookie: supervisor,
        body: {
          workshopId: wsA,
          projectId: prjA,
          workerId: ali?.id,
          workerName: 'علی',
          reportDate: today,
          content: `تست ارزیابی — قالب‌بندی سقف (روز ${i + 1})`,
          crewCount: 4,
        },
      })
      if (i === 0 && rep.status !== 201) {
        check('ثبت گزارش کار موفق', false, JSON.stringify(rep.json))
      }
    }

    // تعیین هدف توسط مدیر پروژه — هدف = شمارش پایه + ۳ → تحقق کامل پس از ۳ گزارش جدید
    const goalTarget = baseReports + 3
    const goal = await req('/api/v1/performance/goals', {
      method: 'POST',
      cookie: manager,
      body: { workerId: ali?.id, period: monthNow, targetReports: goalTarget },
    })
    check('تعیین هدف ماهانه توسط مدیر پروژه موفق', goal.status === 201, JSON.stringify(goal.json))

    // نیروی اجرایی نمی‌تواند هدف تعیین کند
    const goalDenied = await req('/api/v1/performance/goals', {
      method: 'POST',
      cookie: worker,
      body: { workerId: ali?.id, period: monthNow, targetReports: 10 },
    })
    check('تعیین هدف توسط نیروی اجرایی — 403', goalDenied.status === 403, `status=${goalDenied.status}`)

    // مشاهدهٔ ارزیابی توسط مدیر کل
    const perf = await req(`/api/v1/performance?month=${monthNow}`, { cookie: gm })
    check('ارزیابی برای مدیر کل 200', perf.status === 200)
    const aliRow = (perf.json?.data?.workers ?? []).find((w) => w.workerId === ali?.id)
    check('کارگر علی در ارزیابی دیده می‌شود', aliRow != null, JSON.stringify(perf.json?.data?.workers?.map((w) => w.name)))
    check('۳ گزارش جدید افزوده شد', aliRow?.reportsCount === baseReports + 3, `count=${aliRow?.reportsCount} base=${baseReports}`)
    check('مجموع نفرات +۱۲ افزایش یافت', aliRow?.crewSum === baseCrew + 12)
    check('درصد تحقق = ۱۰۰٪', aliRow?.goal?.achievementPct === 100, JSON.stringify(aliRow?.goal))
    check('هدف با مقدار درست ذخیره شد', aliRow?.goal?.targetReports === goalTarget)

    // ارزیابی برای حسابدار (مجوز دارد)
    const perfAcc = await req(`/api/v1/performance`, { cookie: accountant })
    check('ارزیابی برای حسابدار 200', perfAcc.status === 200)

    // حذف هدف
    const goalDeleted = await req(`/api/v1/performance/goals?id=${aliRow?.goal?.id}`, { method: 'DELETE', cookie: manager })
    check('حذف هدف موفق', goalDeleted.status === 200, JSON.stringify(goalDeleted.json))
    const perf2 = await req(`/api/v1/performance?month=${monthNow}`, { cookie: gm })
    const aliRow2 = (perf2.json?.data?.workers ?? []).find((w) => w.workerId === ali?.id)
    check('پس از حذف، هدف پاک شد', aliRow2?.goal === null)

    // خلاصهٔ دوره به تفکیک کارگاه
    check('تجمیع دوره‌ای کارگاه موجود است', (perf2.json?.data?.byWorkshop ?? []).length > 0)
  }

  console.log('── ۷) پاک‌سازی رکوردهای تست ──')
  {
    // حذف پرداخت‌های تست و برگرداندن وضعیت خرید (برای عدم آلودگی دادهٔ نمایشی)
    const list = await req(`/api/v1/finance/payments?purchaseId=${purchaseId}`, { cookie: admin })
    for (const p of list.json?.data?.payments ?? []) {
      await req(`/api/v1/finance/payments/${p.id}`, { method: 'DELETE', cookie: admin })
    }
    const afterDel = await req(`/api/v1/finance/payments?purchaseId=${purchaseId}`, { cookie: admin })
    check('حذف پرداخت توسط ادمین موفق', (afterDel.json?.data?.payments ?? []).length === 0)
  }

  console.log(`\n════════ نتیجه: ${pass} پاس / ${fail} شکست ════════`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('💥 خطای اجرای تست:', e)
  process.exit(1)
})

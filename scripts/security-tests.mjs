/**
 * تست امنیتی و عملکردی سامانه ثبت ورود مصالح
 * ۱) IDOR: Supervisor A نباید داده‌های Supervisor B / کارگاه B را ببیند
 * ۲) قانون ۲۴ ساعت: ویرایش بعد از مهلت = 423 ENTRY_LOCKED
 * ۳) Workflow: DRAFT→SUBMITTED→APPROVED + Correction Request
 * ۴) Validation و دسترسی‌ها
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
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
  }
  if (cookie) headers['Cookie'] = cookie
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
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

async function login(username, password = '123456') {
  const res = await req('/api/v1/auth/login', { method: 'POST', body: { username, password } })
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${JSON.stringify(res.json)}`)
  const raw = res.setCookie ?? ''
  const token = /smi_session=([^;]+)/.exec(raw)?.[1]
  return { cookie: `smi_session=${token}`, user: res.json?.data?.user }
}

async function main() {
  console.log('── ۱) ورود و اصل جداسازی ──')
  const supA = await login('supervisor.sa') // کارگاه سعادت‌آباد
  const supB = await login('supervisor.da') // کارگاه دروس
  const mgr = await login('manager.sa')
  const admin = await login('admin')

  // ورود با گذرواژه غلط
  {
    const res = await req('/api/v1/auth/login', { method: 'POST', body: { username: 'supervisor.sa', password: 'wrongpass' } })
    check('گذرواژه غلط → 401', res.status === 401)
  }
  // CSRF بدون هدر
  {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'supervisor.sa', password: '123456' }),
    })
    check('بدون هدر X-Requested-With → 403', res.status === 403)
  }

  console.log('── ۲) IDOR — لیست‌ها ──')
  // ثبت‌های supervisor A فقط کارگاه A
  {
    const res = await req('/api/v1/material-entries?pageSize=50', { cookie: supA.cookie })
    const entries = res.json?.data?.entries ?? []
    check('لیست ثبت‌های A فقط از کارگاه A', entries.every((e) => e.workshopName.includes('سعادت')), JSON.stringify(entries.map((e) => e.workshopName)))
    const resB = await req('/api/v1/material-entries?pageSize=50', { cookie: supB.cookie })
    const entriesB = resB.json?.data?.entries ?? []
    const aIds = new Set(entries.map((e) => e.id))
    check('Supervisor B هیچ ثبت کارگاه A را نمی‌بیند', entriesB.every((e) => !aIds.has(e.id)))
  }
  // master data — تأمین‌کننده کارگاه B نباید برای A بیاید
  {
    const res = await req('/api/v1/master', { cookie: supA.cookie })
    const suppliers = res.json?.data?.suppliers ?? []
    check('Supervisor A تأمین‌کننده کارگاه B را نمی‌بیند', suppliers.every((s) => !s.name.includes('دروس')), JSON.stringify(suppliers))
    const materials = res.json?.data?.materials ?? []
    check('Supervisor A مصالح کارگاه B را نمی‌بیند', materials.every((m) => !m.name.includes('دروس')))
    const projects = res.json?.data?.projects ?? []
    check('Supervisor A پروژه دروس را نمی‌بیند', projects.every((p) => !p.name.includes('دروس')), JSON.stringify(projects))
  }

  console.log('── ۳) IDOR — دسترسی مستقیم با ID ──')
  // پیدا کردن یک entry از کارگاه A از دید ادمین، سپس دسترسی B به آن
  let entryA_id = null
  {
    const res = await req('/api/v1/material-entries?pageSize=1', { cookie: admin.cookie })
    entryA_id = res.json?.data?.entries?.[0]?.id ?? null
    check('ادمین به ثبت دسترسی دارد', !!entryA_id)
  }
  {
    const res = await req(`/api/v1/material-entries/${entryA_id}`, { cookie: supB.cookie })
    check(`GET مستقیم ثبت کارگاه A توسط B → 404 (گرفت ${res.status})`, res.status === 404)
  }
  {
    const res = await req(`/api/v1/material-entries/${entryA_id}/versions`, { cookie: supB.cookie })
    check('نسخه‌های ثبت A توسط B → 404', res.status === 404)
  }
  {
    const res = await req(`/api/v1/material-entries/${entryA_id}`, {
      method: 'PATCH',
      cookie: supB.cookie,
      body: {
        type: 'PURCHASE',
        sourceType: 'SUPPLIER',
        projectIds: ['prj-any'],
        items: [{ materialName: 'x', quantity: 1, unit: 'عدد' }],
        workers: [],
        hasInvoice: false,
      },
    })
    check('PATCH معتبر ثبت A توسط B → 404', res.status === 404, `got ${res.status}`)
  }
  {
    const res = await req(`/api/v1/material-entries/${entryA_id}/review`, {
      method: 'POST',
      cookie: supB.cookie,
      body: { action: 'APPROVE' },
    })
    check('APPROVE ثبت A توسط سرپرست B → 403/404 (گرفت ' + res.status + ')', res.status === 403 || res.status === 404)
  }
  // ID بدون وجود
  {
    const res = await req('/api/v1/material-entries/does-not-exist-123', { cookie: supA.cookie })
    check('ID ناموجود → 404', res.status === 404)
  }

  console.log('── ۴) Workflow کامل ──')
  // سرپرست A یک ثبت می‌سازد و ارسال می‌کند
  let created = null
  {
    const master = await req('/api/v1/master', { cookie: supA.cookie })
    const projects = master.json?.data?.projects ?? []
    const res = await req('/api/v1/material-entries', {
      method: 'POST',
      cookie: supA.cookie,
      body: {
        type: 'PURCHASE',
        sourceType: 'SUPPLIER',
        sourceSupplierId: (master.json?.data?.suppliers ?? [])[0]?.id ?? null,
        projectIds: [projects[0].id],
        items: [{ materialName: 'سیمان تیپ دو', quantity: 50, unit: 'کیسه' }],
        workers: [{ workerName: 'علی', workerKind: 'LABORER' }],
        hasInvoice: true,
        status: 'DRAFT',
      },
    })
    created = res.json?.data
    check('ایجاد ثبت → 201', res.status === 201 && !!created?.id, JSON.stringify(res.json))
    check('شماره ثبت تخصیص یافت', (created?.entryNumber ?? 0) > 2)
  }
  // ثبت جدید توسط مدیر پروژه قابل مشاهده باشد بعد از submit
  {
    // مدیر پروژه نباید به DRAFT دسترسی داشته باشد؟ — DRAFT فقط برای سرپرست است، ولی در scope است؛ بررسی submit
    const res = await req(`/api/v1/material-entries/${created.id}/submit`, { method: 'POST', cookie: supA.cookie })
    check('submit → SUBMITTED', res.status === 200 && res.json?.data?.status === 'SUBMITTED', JSON.stringify(res.json))
    check('editDeadline تنظیم شد (۲۴ ساعت)', res.json?.data?.editDeadline != null)
  }
  // ویرایش در مهلت مجاز + ساخت نسخه ۲
  {
    const res = await req(`/api/v1/material-entries/${created.id}`, {
      method: 'PATCH',
      cookie: supA.cookie,
      body: {
        type: 'PURCHASE',
        sourceType: 'SUPPLIER',
        projectIds: [(await req('/api/v1/master', { cookie: supA.cookie })).json.data.projects[0].id],
        items: [{ materialName: 'سیمان تیپ دو', quantity: 60, unit: 'کیسه' }],
        workers: [],
        hasInvoice: true,
      },
    })
    check('ویرایش در مهلت مجاز + نسخه ۲', res.status === 200 && res.json?.data?.currentVersion === 2, JSON.stringify(res.json))
  }
  // تأیید مدیر
  {
    const res = await req(`/api/v1/material-entries/${created.id}/review`, {
      method: 'POST',
      cookie: mgr.cookie,
      body: { action: 'APPROVE' },
    })
    check('تأیید مدیر → APPROVED', res.status === 200 && res.json?.data?.status === 'APPROVED', JSON.stringify(res.json))
  }
  // سرپرست B نمی‌تواند ثبت A را review کند — پوشش داده شد
  // ثبت دوم: correction flow
  {
    const master = await req('/api/v1/master', { cookie: supA.cookie })
    const projects = master.json?.data?.projects ?? []
    const cr = await req('/api/v1/material-entries', {
      method: 'POST',
      cookie: supA.cookie,
      body: {
        type: 'TRANSFER',
        sourceType: 'WORKSHOP',
        projectIds: [projects[0].id],
        items: [{ materialName: 'بلوک سفالی', quantity: 300, unit: 'عدد' }],
        workers: [],
        hasInvoice: false,
        status: 'DRAFT',
      },
    })
    const entry2 = cr.json?.data?.id
    await req(`/api/v1/material-entries/${entry2}/submit`, { method: 'POST', cookie: supA.cookie })
    const rc = await req(`/api/v1/material-entries/${entry2}/review`, {
      method: 'POST',
      cookie: mgr.cookie,
      body: { action: 'REQUEST_CORRECTION', reason: 'نام کارگاه مبدأ را مشخص کنید' },
    })
    check('درخواست اصلاح مدیر → CORRECTION_REQUESTED', rc.json?.data?.status === 'CORRECTION_REQUESTED', JSON.stringify(rc.json))
    const rs = await req(`/api/v1/material-entries/${entry2}/resubmit`, { method: 'POST', cookie: supA.cookie })
    check('ارسال مجدد سرپرست → RESUBMITTED', rs.json?.data?.status === 'RESUBMITTED', JSON.stringify(rs.json))
    const ap = await req(`/api/v1/material-entries/${entry2}/review`, {
      method: 'POST',
      cookie: mgr.cookie,
      body: { action: 'APPROVE' },
    })
    check('تأیید نهایی', ap.json?.data?.status === 'APPROVED')
  }
  // سرپرست نمی‌تواند review کند
  {
    const res = await req(`/api/v1/material-entries/${created.id}/review`, {
      method: 'POST',
      cookie: supA.cookie,
      body: { action: 'APPROVE' },
    })
    check('سرپرست → review ممنوع (403)', res.status === 403, `got ${res.status}`)
  }

  console.log('── ۵) قانون ۲۴ ساعت ──')
  // مستقیم در DB مهلت را به گذشته می‌بریم و ویرایش را تست می‌کنیم
  {
    // ثبت اولیه seed با submittedAt سه روز پیش: entryNumber 2 (میلگرد، APPROVED)
    // از طریق API پیدا می‌کنیم با ادمین — pageSize سقف ۵۰ دارد، پس صفحه‌به‌صفحه می‌گردیم
    let oldEntry = null
    for (let page = 1; page <= 10 && !oldEntry; page++) {
      const res = await req(`/api/v1/material-entries?page=${page}&pageSize=50&status=ALL`, { cookie: admin.cookie })
      const entries = res.json?.data?.entries ?? []
      oldEntry = entries.find((e) => e.entryNumber === 2) ?? null
      const { totalPages } = res.json?.data?.pagination ?? {}
      if (!totalPages || page >= totalPages) break
    }
    check('ثبت قدیمی (بیش از ۲۴ ساعت) پیدا شد', !!oldEntry)
    if (oldEntry) {
      const res = await req(`/api/v1/material-entries/${oldEntry.id}`, { cookie: supA.cookie })
      check('GET ثبت قدیمی: canEdit=false', res.json?.data?.entry?.canEdit === false)
      check('GET ثبت قدیمی: canRequestCorrection=true', res.json?.data?.entry?.canRequestCorrection === true)
      const patch = await req(`/api/v1/material-entries/${oldEntry.id}`, {
        method: 'PATCH',
        cookie: supA.cookie,
        body: {
          type: 'PURCHASE',
          sourceType: 'SUPPLIER',
          projectIds: [(await req('/api/v1/master', { cookie: supA.cookie })).json.data.projects[0].id],
          items: [{ materialName: 'میلگرد ۱۴', quantity: 3, unit: 'تن' }],
          workers: [],
          hasInvoice: false,
        },
      })
      check('ویرایش بعد از ۲۴ ساعت → 423 ENTRY_LOCKED', patch.status === 423 && patch.json?.code === 'ENTRY_LOCKED', `got ${patch.status} ${JSON.stringify(patch.json)}`)
      // تغییر ساعت موبایل اثری ندارد — مبنای سرور است (simulate: هیچ هدر زمانی از کلاینت استفاده نمی‌شود)
      const crc = await req(`/api/v1/material-entries/${oldEntry.id}/correction-request`, {
        method: 'POST',
        cookie: supA.cookie,
        body: { reason: 'مقدار میلگرد اشتباه ثبت شده است' },
      })
      check('درخواست اصلاح بعد از قفل → 201', crc.status === 201, JSON.stringify(crc.json))
    }
  }

  console.log('── ۶) اعلان‌ها و حسابرسی ──')
  {
    const n = await req('/api/v1/notifications', { cookie: mgr.cookie })
    check('مدیر اعلان ثبت جدید دارد', (n.json?.data?.notifications ?? []).length > 0)
    const nA = await req('/api/v1/notifications', { cookie: supA.cookie })
    const titles = (nA.json?.data?.notifications ?? []).map((x) => x.type)
    check('سرپرست اعلان تأیید دارد', titles.includes('ENTRY_APPROVED'), JSON.stringify(titles))
  }
  {
    const a = await req('/api/v1/audit-logs?pageSize=10', { cookie: admin.cookie })
    check('Audit Log پر است', (a.json?.data?.logs ?? []).length > 0)
    const actions = (a.json?.data?.logs ?? []).map((l) => l.action)
    check('اقدام APPROVE در Audit ثبت شده', actions.includes('APPROVE'))
    const aA = await req('/api/v1/audit-logs?pageSize=10', { cookie: supA.cookie })
    const logsA = aA.json?.data?.logs ?? []
    check('Audit سرپرست فقط لاگ خودش است', logsA.every((l) => l.user?.fullName?.includes('اکبر') || l.userId === supA.user.id), JSON.stringify(logsA.slice(0, 3)))
  }

  console.log('── ۷) سرورفایل امن ──')
  {
    // آپلود فایل برای ثبت خود A
    const form = new FormData()
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0))
    form.append('file', new Blob([bytes], { type: 'image/png' }), 'invoice.png')
    form.append('kind', 'INVOICE')
    form.append('entryId', created.id)
    const res = await fetch(`${BASE}/api/v1/attachments`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: supA.cookie },
      body: form,
    })
    const j = await res.json()
    check('آپلود فاکتور → 201', res.status === 201, JSON.stringify(j))
    const attId = j?.data?.id
    // بدون توکن و بدون نشست → 404
    const noAuth = await fetch(`${BASE}/api/v1/attachments/${attId}/file`)
    check('دانلود بدون نشست/توکن → 404', noAuth.status === 404, `got ${noAuth.status}`)
    // با توکن امضاشده
    const signedUrl = j?.data?.url
    const withToken = await fetch(`${BASE}${signedUrl}`)
    check('دانلود با Signed URL → 200', withToken.status === 200, `got ${withToken.status}`)
    // با نشست سرپرست B → 404
    const bFile = await fetch(`${BASE}/api/v1/attachments/${attId}/file`, { headers: { Cookie: supB.cookie } })
    check('دانلود فایل A توسط B → 404', bFile.status === 404, `got ${bFile.status}`)
    // MIME نامعتبر
    const badForm = new FormData()
    badForm.append('file', new Blob([bytes], { type: 'application/x-msdownload' }), 'virus.exe')
    badForm.append('kind', 'OTHER')
    badForm.append('entryId', created.id)
    const bad = await fetch(`${BASE}/api/v1/attachments`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: supA.cookie },
      body: badForm,
    })
    check('فایل EXE → 415', bad.status === 415, `got ${bad.status}`)
  }

  console.log(`\n══ نتیجه: ${pass} موفق، ${fail} ناموفق ══`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('TEST CRASH:', e)
  process.exit(1)
})

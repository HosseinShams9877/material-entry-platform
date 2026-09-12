/**
 * تست ماژول وظایف و گزارش روزانه کارگاه
 * پوشش: ایجاد دستی/صوتی، ارسال، IDOR بین کارگاهی، تیک/برداشتن تیک، تکمیل خودکار،
 * گزارش روزانه (نوشتار/صوت/بررسی)، Signed URL، MIME جعلی، حجم، اعتبارسنجی، اعلان‌ها، فیلترها
 */
const BASE = 'http://localhost:3000'
const DEV_SECRET = 'dev-only-ephemeral-signed-url-secret' // فقط در Development

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

function makeWav(sizeBytes = 40000) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(sizeBytes - 8, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(32000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(sizeBytes - 44, 40)
  const data = Buffer.alloc(Math.max(0, sizeBytes - 44), 0x42)
  return Buffer.concat([header, data])
}

async function uploadAudio(cookie, buffer, fileName, mime = 'audio/wav', endpoint = '/api/v1/daily-tasks/audio') {
  const form = new FormData()
  form.append('audio', new Blob([buffer], { type: mime }), fileName)
  const res = await fetch(`${BASE}${endpoint}`, {
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

async function getNotifications(cookie) {
  const res = await req('/api/v1/notifications?pageSize=50', { cookie })
  return res.json?.data?.notifications ?? []
}

async function main() {
  console.log('── ۱) ورود و دسترسی پایه ──')
  const wm = await login('manager.sa') // در این دیتابیس manager.sa نقش PROJECT_MANAGER دارد
  const admin = await login('admin') // SUPER_ADMIN
  const supA = await login('supervisor.sa') // کارگاه سعادت‌آباد
  const supB = await login('supervisor.da') // کارگاه دروس

  // مدیر کارگاه آزمایشی در seed موجود نیست — از admin به‌عنوان سازندهٔ وظیفه استفاده می‌کنیم (دسترسی ALL)
  // و supervisor.sa را به‌عنوان سرپرست کارگاه سعادت‌آباد.

  {
    const res = await fetch(`${BASE}/api/v1/daily-tasks`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    check('بدون نشست → 401', res.status === 401)
  }
  {
    const res = await fetch(`${BASE}/api/v1/daily-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    check('POST بدون هدر X-Requested-With → 403', res.status === 403)
  }

  // داده‌های پایه
  const master = await req('/api/v1/master', { cookie: admin.cookie ?? admin })
  void master
  const md = await req('/api/v1/master', { cookie: supA })
  const workshops = md.json?.data?.workshops ?? []
  const projects = md.json?.data?.projects ?? []
  const whA = workshops.find((w) => w.name.includes('سعادت'))
  const prjA = projects.find((p) => p.name.includes('سعادت') && !p.name.includes('فاز'))
  const supervisors = (await req('/api/v1/master', { cookie: admin })).json?.data?.supervisors ?? []
  const supAUser = supervisors.find((s) => s.fullName.includes('اکبر'))
  const supBUser = supervisors.find((s) => s.fullName.includes('قادر'))
  check('Master data شامل سرپرستان است', !!supAUser && !!supBUser)

  console.log('── ۲) ایجاد وظیفه دستی ──')
  let taskId = null
  {
    const res = await req('/api/v1/daily-tasks', {
      method: 'POST',
      cookie: admin,
      body: {
        projectId: prjA.id,
        workshopId: whA.id,
        title: 'شمارش میلگردهای انبار شماره دو',
        description: 'شمارش دقیق و ثبت در سیستم',
        priority: 'HIGH',
        assignedDate: '2026-09-10',
        dueDate: new Date(Date.now() + 6 * 3600_000).toISOString(),
        assigneeIds: [supAUser.id],
        items: [
          { title: 'شمارش میلگردهای انبار شماره دو', sortOrder: 0 },
          { title: 'بررسی وضعیت بتن‌ریزی قطعه سه', sortOrder: 1 },
          { title: 'ارسال گزارش کمبود سیمان', sortOrder: 2 },
        ],
      },
    })
    taskId = res.json?.data?.taskId
    check('ایجاد وظیفه دستی → 201', res.status === 201, JSON.stringify(res.json))
    // اعتبارسنجی‌ها
    const bad = await req('/api/v1/daily-tasks', { method: 'POST', cookie: admin, body: { projectId: prjA.id, workshopId: whA.id, title: 'ab', assignedDate: '2026-09-10' } })
    check('عنوان کوتاه → 422', bad.status === 422)
    const badPri = await req('/api/v1/daily-tasks', { method: 'POST', cookie: admin, body: { projectId: prjA.id, workshopId: whA.id, title: 'عنوان تستی', assignedDate: '2026-09-10', priority: 'CRITICAL' } })
    check('اولویت نامعتبر → 422', badPri.status === 422)
    const badDate = await req('/api/v1/daily-tasks', { method: 'POST', cookie: admin, body: { projectId: prjA.id, workshopId: whA.id, title: 'عنوان تستی', assignedDate: '۱۴۰۵/۰۶/۱۹' } })
    check('تاریخ غیر ISO → 422', badDate.status === 422)
  }
  {
    // سرپرست حق ایجاد وظیفه ندارد
    const res = await req('/api/v1/daily-tasks', { method: 'POST', cookie: supA, body: { projectId: prjA.id, workshopId: whA.id, title: 'تست دسترسی سرپرست', assignedDate: '2026-09-10' } })
    check('سرپرست ایجاد وظیفه → 403', res.status === 403)
  }

  console.log('── ۳) ارسال وظیفه و IDOR ──')
  {
    // ارسال به سرپرست کارگاه دیگر → رد
    const res = await req(`/api/v1/daily-tasks/${taskId}/send`, { method: 'POST', cookie: admin, body: { assigneeIds: [supBUser.id] } })
    check('ارسال به سرپرست کارگاه دیگر → 422', res.status === 422)
    // ارسال درست
    const ok = await req(`/api/v1/daily-tasks/${taskId}/send`, { method: 'POST', cookie: admin, body: { assigneeIds: [supAUser.id] } })
    check('ارسال به سرپرست درست → 200', ok.status === 200, JSON.stringify(ok.json))
    const notif = await getNotifications(supA)
    check('اعلان TASK_SENT برای سرپرست', notif.some((n) => n.type === 'TASK_SENT' && n.entityId === taskId))
    // supervisor.da وظیفه را نمی‌بیند
    const idor = await req(`/api/v1/daily-tasks/${taskId}`, { cookie: supB })
    check('IDOR: سرپرست B جزئیات وظیفه A → 404', idor.status === 404)
    const idorList = await req('/api/v1/daily-tasks?pageSize=50', { cookie: supB })
    check('IDOR: لیست B شامل وظیفه A نیست', (idorList.json?.data?.tasks ?? []).every((t) => t.id !== taskId))
  }

  console.log('── ۴) تیک آیتم و تکمیل خودکار ──')
  let itemIds = []
  {
    const detail = await req(`/api/v1/daily-tasks/${taskId}`, { cookie: supA })
    itemIds = detail.json?.data?.task?.items?.map((i) => i.id) ?? []
    check('سرپرست ۳ آیتم می‌بیند', itemIds.length === 3)
    check('canComplete فعال است', detail.json?.data?.task?.canComplete === true)

    const t1 = await req(`/api/v1/daily-tasks/${taskId}/items/${itemIds[0]}/complete`, { method: 'POST', cookie: supA, body: { note: 'شمارش انجام شد' } })
    check('تیک آیتم ۱ → 200', t1.status === 200, JSON.stringify(t1.json))
    check('زمان انجام ثبت شده', !!t1.json?.data?.item?.completedAt)
    check('وضعیت وظیفه → IN_PROGRESS', t1.json?.data?.taskStatus === 'IN_PROGRESS')

    // برداشتن تیک + Audit
    const untick = await req(`/api/v1/daily-tasks/${taskId}/items/${itemIds[0]}/uncomplete`, { method: 'POST', cookie: supA })
    check('برداشتن تیک → 200', untick.status === 200)
    const audits = await req('/api/v1/audit-logs?action=UNCOMPLETE_TASK_ITEM&pageSize=10', { cookie: admin })
    check('Audit UNCOMPLETE_TASK_ITEM ثبت شد', (audits.json?.data?.logs ?? audits.json?.data?.entries ?? []).length > 0 || JSON.stringify(audits.json).includes('UNCOMPLETE_TASK_ITEM'))

    // سرپرست B نمی‌تواند آیتم را تیک بزند
    const idorTick = await req(`/api/v1/daily-tasks/${taskId}/items/${itemIds[0]}/complete`, { method: 'POST', cookie: supB, body: {} })
    check('IDOR: تیک توسط سرپرست B → 404', idorTick.status === 404)

    // تکمیل همهٔ آیتم‌ها → تکمیل خودکار
    await req(`/api/v1/daily-tasks/${taskId}/items/${itemIds[0]}/complete`, { method: 'POST', cookie: supA, body: { note: 'انجام شد' } })
    await req(`/api/v1/daily-tasks/${taskId}/items/${itemIds[1]}/complete`, { method: 'POST', cookie: supA, body: {} })
    const last = await req(`/api/v1/daily-tasks/${taskId}/items/${itemIds[2]}/complete`, { method: 'POST', cookie: supA, body: {} })
    check('تکمیل آخرین آیتم → وضعیت COMPLETED', last.json?.data?.taskStatus === 'COMPLETED')
    const detail2 = await req(`/api/v1/daily-tasks/${taskId}`, { cookie: admin })
    check('completedAt وظیفه ثبت شد', !!detail2.json?.data?.task?.completedAt)
    check('progress = ۱۰۰', detail2.json?.data?.task?.progress === 100)

    const pmNotif = await getNotifications(wm)
    check('اعلان TASK_COMPLETED برای مدیر پروژه', pmNotif.some((n) => n.type === 'TASK_COMPLETED' && n.entityId === taskId))
    const mgrNotif = await getNotifications(admin)
    check('اعلان TASK_ITEM_COMPLETED برای ایجادکننده', mgrNotif.some((n) => n.type === 'TASK_ITEM_COMPLETED' && n.entityId === taskId))
  }

  console.log('── ۵) ویرایش و لغو و حذف ──')
  {
    // ویرایش وظیفهٔ COMPLETED → 423
    const res = await req(`/api/v1/daily-tasks/${taskId}`, { method: 'PATCH', cookie: admin, body: { title: 'عنوان جدید بعد از تکمیل' } })
    check('ویرایش وظیفهٔ تکمیل‌شده → 423', res.status === 423)
    // حذف وظیفهٔ غیر پیش‌نویس → 423
    const del = await req(`/api/v1/daily-tasks/${taskId}`, { method: 'DELETE', cookie: admin })
    check('حذف وظیفهٔ ارسال‌شده → 423', del.status === 423)
  }
  let draftId = null
  {
    const res = await req('/api/v1/daily-tasks', {
      method: 'POST',
      cookie: admin,
      body: { projectId: prjA.id, workshopId: whA.id, title: 'وظیفهٔ لغوی برای تست', assignedDate: '2026-09-10', assigneeIds: [supAUser.id], items: [{ title: 'آیتم لغو' }] },
    })
    draftId = res.json?.data?.taskId
    await req(`/api/v1/daily-tasks/${draftId}/send`, { method: 'POST', cookie: admin, body: { assigneeIds: [supAUser.id] } })
    // ویرایش وظیفهٔ ارسال‌شده → اعلان TASK_UPDATED
    await req(`/api/v1/daily-tasks/${draftId}`, { method: 'PATCH', cookie: admin, body: { title: 'وظیفهٔ لغوی ویرایش‌شده' } })
    const notif = await getNotifications(supA)
    check('اعلان TASK_UPDATED برای گیرنده', notif.some((n) => n.type === 'TASK_UPDATED' && n.entityId === draftId))
    // لغو
    const cancel = await req(`/api/v1/daily-tasks/${draftId}/cancel`, { method: 'POST', cookie: admin, body: { reason: 'دیگر لازم نیست' } })
    check('لغو وظیفه → 200', cancel.status === 200)
    const notif2 = await getNotifications(supA)
    check('اعلان TASK_CANCELLED', notif2.some((n) => n.type === 'TASK_CANCELLED' && n.entityId === draftId))
  }
  {
    // حذف پیش‌نویس
    const res = await req('/api/v1/daily-tasks', {
      method: 'POST',
      cookie: admin,
      body: { projectId: prjA.id, workshopId: whA.id, title: 'پیش‌نویس حذفی', assignedDate: '2026-09-10' },
    })
    const id = res.json?.data?.taskId
    const del = await req(`/api/v1/daily-tasks/${id}`, { method: 'DELETE', cookie: admin })
    check('حذف پیش‌نویس → 200', del.status === 200)
  }

  console.log('── ۶) فایل صوتی — اعتبارسنجی و امنیت ──')
  let audioId = null
  {
    const ok = await uploadAudio(admin, makeWav(), 'voice-command.wav', 'audio/wav')
    check('آپلود WAV معتبر → 200', ok.status === 200, JSON.stringify(ok.json))
    audioId = ok.json?.data?.audioId
    check('فایل صوتی ذخیره شد (حفظ حتی در شکست STT)', !!audioId)
    check('وضعیت تبدیل DONE یا FAILED (سرویس خارجی آزاد)', ['DONE', 'FAILED'].includes(ok.json?.data?.transcribeStatus))

    // MIME جعلی: محتوای PNG با نام WAV
    const fake = await uploadAudio(admin, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(200).fill(1)]), 'fake.wav', 'audio/wav')
    check('MIME جعلی → 415', fake.status === 415, JSON.stringify(fake.json))

    // پسوند ناسازگار
    const wrongExt = await uploadAudio(admin, makeWav(), 'voice.mp3', 'audio/wav')
    check('پسوند ناسازگار → 415', wrongExt.status === 415)

    // حجم بیش از حد (۱۶ مگابایت)
    const big = await uploadAudio(admin, makeWav(17 * 1024 * 1024), 'big.wav', 'audio/wav')
    check('فایل بزرگ‌تر از حد → 413', big.status === 413)

    // نام Path Traversal — نام کاربر هرگز ذخیره نمی‌شود
    const trav = await uploadAudio(admin, makeWav(), '../../evil.wav', 'audio/wav')
    check('نام Traversal → رد یا ذخیرهٔ امن (بدون ۵۰۰)', [200, 415].includes(trav.status))

    // سرپرست حق آپلود صوت دارد
    const sup = await uploadAudio(supA, makeWav(), 'sup.wav', 'audio/wav')
    check('آپلود صوت توسط سرپرست → 200', sup.status === 200)
  }

  console.log('── ۷) Signed URL فایل صوتی (روی وظیفهٔ صوتی بخش ۸) ──')

  console.log('── ۸) وظیفهٔ صوتی کامل ──')
  {
    let voiceTaskId = null
    const up = await uploadAudio(admin, makeWav(), 'cmd.wav', 'audio/wav')
    const res = await req('/api/v1/daily-tasks', {
      method: 'POST',
      cookie: admin,
      body: {
        projectId: prjA.id,
        workshopId: whA.id,
        title: 'وظیفهٔ صوتی آزمایشی',
        assignedDate: '2026-09-10',
        sourceType: 'VOICE',
        sourceAudioId: up.json?.data?.audioId,
        sourceTranscript: 'امروز میلگردهای انبار دو را شمارش کنید و وضعیت بتن‌ریزی قطعه سه را بررسی کنید.',
        assigneeIds: [supAUser.id],
        items: [{ title: 'آیتم از متن صوتی', sortOrder: 0 }],
      },
    })
    voiceTaskId = res.json?.data?.taskId
    check('ایجاد وظیفهٔ صوتی → 201', res.status === 201, JSON.stringify(res.json))

    // ── Signed URL روی صوت همین وظیفه ──
    const detail = await req(`/api/v1/daily-tasks/${voiceTaskId}`, { cookie: admin })
    const audio = detail.json?.data?.task?.audio
    check('جزئیات وظیفهٔ صوتی شامل audioUrl امضاشده', !!audio?.audioUrl)
    if (audio) {
      const ok = await fetch(`${BASE}${audio.audioUrl}`)
      check('پخش با Signed URL → 200', ok.status === 200)
      const noToken = await fetch(`${BASE}/api/v1/daily-audio/${audio.id}/file`)
      check('بدون توکن و بدون نشست → 404', noToken.status === 404)
      // توکن منقضی‌شده با Secret توسعه
      const { createHmac } = await import('node:crypto')
      const expired = Date.now() - 1000
      const sig = createHmac('sha256', DEV_SECRET).update(`${audio.id}.${expired}`).digest('hex')
      const expRes = await fetch(`${BASE}/api/v1/daily-audio/${audio.id}/file?token=${expired}.${sig}`)
      check('Signed URL منقضی → 404', expRes.status === 404)
      const fakeSig = await fetch(`${BASE}/api/v1/daily-audio/${audio.id}/file?token=${Date.now() + 60000}.${'a'.repeat(64)}`)
      check('امضای جعلی → 404', fakeSig.status === 404)
      // دسترسی سرپرست B به فایل صوتی
      const idor = await fetch(`${BASE}/api/v1/daily-audio/${audio.id}/file`, { headers: { Cookie: supB } })
      check('IDOR: فایل صوتی توسط B → 404', idor.status === 404)
    }
    // استفادهٔ مجدد از همان صوت → 409
    const reuse = await req('/api/v1/daily-tasks', {
      method: 'POST',
      cookie: admin,
      body: { projectId: prjA.id, workshopId: whA.id, title: 'استفادهٔ مجدد صوت', assignedDate: '2026-09-10', sourceAudioId: up.json?.data?.audioId },
    })
    check('استفادهٔ مجدد فایل صوتی → 409', reuse.status === 409)

    // استخراج آیتم از متن (LLM) — 200 یا شکست باکنترل 502
    const extract = await req('/api/v1/daily-tasks/extract-items', { method: 'POST', cookie: admin, body: { transcript: 'امروز میلگردهای انبار شماره دو را شمارش کنید، وضعیت بتن‌ریزی قطعه سه را بررسی کنید و گزارش کمبود سیمان را ارسال کنید.' } })
    check('استخراج آیتم‌ها → 200 یا 502 کنترل‌شده', [200, 502].includes(extract.status), JSON.stringify(extract.json).slice(0, 120))
    if (extract.status === 200) {
      check('آیتم‌های استخراجی ساختار درست دارند', Array.isArray(extract.json?.data?.items) && extract.json.data.items.length > 0)
    }
    void voiceTaskId
  }

  console.log('── ۹) گزارش روزانه سرپرست ──')
  let reportId = null
  {
    const res = await req('/api/v1/daily-reports', {
      method: 'POST',
      cookie: supA,
      body: { projectId: prjA.id, workshopId: whA.id, reportDate: '2026-09-10', title: 'گزارش روزانهٔ کارگاه سعادت‌آباد', content: 'بتن‌ریزی قطعه سه انجام شد؛ کمبود سیمان تیپ دو داریم.', sourceType: 'MANUAL' },
    })
    reportId = res.json?.data?.reportId
    check('ایجاد گزارش → 201', res.status === 201, JSON.stringify(res.json))
    const submit = await req(`/api/v1/daily-reports/${reportId}/submit`, { method: 'POST', cookie: supA })
    check('ارسال گزارش → 200', submit.status === 200)
    const notif = await getNotifications(wm)
    check('اعلان REPORT_SUBMITTED برای مدیر پروژه', notif.some((n) => n.type === 'REPORT_SUBMITTED' && n.entityId === reportId))
    // ویرایش بعد از ارسال → 423
    const patch = await req(`/api/v1/daily-reports/${reportId}`, { method: 'PATCH', cookie: supA, body: { content: 'تغییر بعد از ارسال' } })
    check('ویرایش گزارش ارسال‌شده → 423', patch.status === 423)
    // IDOR: سرپرست B گزارش را نمی‌بیند
    const idor = await req(`/api/v1/daily-reports/${reportId}`, { cookie: supB })
    check('IDOR: گزارش توسط سرپرست B → 404', idor.status === 404)
    // بررسی توسط مدیر پروژه
    const review = await req(`/api/v1/daily-reports/${reportId}/review`, { method: 'POST', cookie: wm, body: { note: 'دریافت شد' } })
    check('بررسی گزارش توسط مدیر پروژه → 200', review.status === 200, JSON.stringify(review.json))
    const notif2 = await getNotifications(supA)
    check('اعلان REPORT_REVIEWED برای گزارش‌دهنده', notif2.some((n) => n.type === 'REPORT_REVIEWED' && n.entityId === reportId))
    // بررسی مجدد → 423
    const again = await req(`/api/v1/daily-reports/${reportId}/review`, { method: 'POST', cookie: wm, body: {} })
    check('بررسی مجدد گزارش → 423', again.status === 423)
  }
  {
    // گزارش صوتی سرپرست — آپلود از مسیر مخصوص گزارش
    const up = await uploadAudio(supA, makeWav(), 'report.wav', 'audio/wav', '/api/v1/daily-reports/audio')
    check('آپلود صوت گزارش → 200', up.status === 200, JSON.stringify(up.json))
    const res = await req('/api/v1/daily-reports', {
      method: 'POST',
      cookie: supA,
      body: { projectId: prjA.id, workshopId: whA.id, reportDate: '2026-09-10', title: 'گزارش صوتی امروز', content: 'متن گزارش صوتی', sourceType: 'VOICE', audioId: up.json?.data?.audioId, transcript: up.json?.data?.transcript },
    })
    check('ایجاد گزارش صوتی → 201', res.status === 201, JSON.stringify(res.json))
    const rid = res.json?.data?.reportId
    const detail = await req(`/api/v1/daily-reports/${rid}`, { cookie: wm })
    check('مدیر پروژه صوت گزارش را می‌بیند', !!detail.json?.data?.report?.audio?.audioUrl)
  }

  console.log('── ۱۰) فیلترها و داشبورد ──')
  {
    const completed = await req('/api/v1/daily-tasks?status=COMPLETED&pageSize=50', { cookie: admin })
    check('فیلتر COMPLETED', (completed.json?.data?.tasks ?? []).every((t) => t.status === 'COMPLETED'))
    const mine = await req('/api/v1/daily-tasks?mine=1&pageSize=50', { cookie: supA })
    check('فیلتر mine برای سرپرست', (mine.json?.data?.tasks ?? []).every((t) => t.assignees.some((a) => a.fullName.includes('اکبر'))))
    const dash = await req('/api/v1/daily-dashboard', { cookie: wm })
    check('داشبورد روزانه → 200', dash.status === 200)
    check('داشبورد شمارنده دارد', typeof dash.json?.data?.stats?.todayTasks === 'number')
    check('داشبورد Timeline دارد', Array.isArray(dash.json?.data?.timeline))
    const dashSup = await req('/api/v1/daily-dashboard', { cookie: supA })
    check('داشبورد برای سرپرست (بدون audit) → 200', dashSup.status === 200)
  }

  console.log(`\n═══ نتیجه: ${pass} موفق، ${fail} ناموفق ═══`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('خطای کلی تست:', e)
  process.exit(1)
})

/**
 * تست ماژول وظایف و گزارش روزانه کارگاه
 * پوشش: ایجاد دستی، ارسال، IDOR بین کارگاهی، تیک/برداشتن تیک، تکمیل خودکار،
 * گزارش روزانه (نوشتار/بررسی)، حذف کامل ماژول صوت، اعتبارسنجی، اعلان‌ها، فیلترها
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

  console.log('── ۶) حذف کامل ماژول صوت — نقاط پایانی نباید وجود داشته باشند ──')
  {
    // مسیر آپلود پیام صوتی وظیفه/گزارش — حذف فیزیکی شده
    const tAudio = await req('/api/v1/daily-tasks/audio', { method: 'POST', cookie: admin, body: {} })
    check('مسیر daily-tasks/audio حذف شده → 404/405', [404, 405].includes(tAudio.status), `got=${tAudio.status}`)
    const rAudio = await req('/api/v1/daily-reports/audio', { method: 'POST', cookie: admin, body: {} })
    check('مسیر daily-reports/audio حذف شده → 404/405', [404, 405].includes(rAudio.status), `got=${rAudio.status}`)
  }

  console.log('── ۷) حذف کامل تبدیل ویس به نوشتار و فیلدهای صوتی ──')
  {
    // مسیرهای حذف‌شدهٔ Voice Pipeline
    const vt = await req('/api/v1/voice/transcribe', { method: 'POST', cookie: admin, body: {} })
    check('مسیر voice/transcribe حذف شده → 404', vt.status === 404)
    const ve = await req('/api/v1/voice/extract', { method: 'POST', cookie: admin, body: { transcript: 'تست' } })
    check('مسیر voice/extract حذف شده → 404', ve.status === 404)
    const extract = await req('/api/v1/daily-tasks/extract-items', { method: 'POST', cookie: admin, body: { transcript: 'تست استخراج آیتم از متن دستور مدیر کارگاه' } })
    check('مسیر extract-items حذف شده → 404 یا 405', [404, 405].includes(extract.status))

    // فیلدهای صوتی وظیفه — نادیده گرفته می‌شوند (Strip) و وظیفهٔ دستی ساخته می‌شود
    const res = await req('/api/v1/daily-tasks', {
      method: 'POST',
      cookie: admin,
      body: {
        projectId: prjA.id,
        workshopId: whA.id,
        title: 'وظیفهٔ آزمایشی با فیلد صوتی منسوخ',
        assignedDate: '2026-09-10',
        sourceType: 'VOICE',
        sourceAudioId: 'gone-audio-id',
        sourceTranscript: 'این متن دیگر ذخیره نمی‌شود.',
        assigneeIds: [supAUser.id],
        items: [{ title: 'آیتم دستی', sortOrder: 0 }],
      },
    })
    check('ایجاد وظیفه با فیلد صوتی منسوخ → 201 (فیلدها Strip می‌شوند)', res.status === 201, JSON.stringify(res.json))
    const taskId = res.json?.data?.taskId
    const detail = await req(`/api/v1/daily-tasks/${taskId}`, { cookie: admin })
    const t = detail.json?.data?.task
    check('وظیفه audio و sourceTranscript ندارد', t?.audio === undefined && t?.sourceTranscript === undefined)
    check('وظیفه sourceType ندارد', t?.sourceType === undefined)

    // فیلدهای صوتی منسوخ گزارش — نادیده گرفته می‌شوند و گزارش دستی ثبت می‌شود
    const rep = await req('/api/v1/daily-reports', {
      method: 'POST',
      cookie: admin,
      body: { projectId: prjA.id, workshopId: whA.id, reportDate: '2026-09-10', title: 'گزارش با فیلد صوتی منسوخ', content: 'متن گزارش آزمایشی با فیلد صوتی منسوخ.', sourceType: 'VOICE', audioId: 'gone-audio-id' },
    })
    check('گزارش با فیلد صوتی منسوخ → 201 (فیلدها Strip می‌شوند)', rep.status === 201, JSON.stringify(rep.json))
    const repId = rep.json?.data?.reportId
    const repDetail = await req(`/api/v1/daily-reports/${repId}`, { cookie: admin })
    const savedRep = repDetail.json?.data?.report
    check('گزارش دیگر فیلد audio ندارد', savedRep?.audio === undefined || savedRep?.audio === null)
    check('گزارش sourceType آن MANUAL است', savedRep?.sourceType === 'MANUAL', JSON.stringify(savedRep?.sourceType))

    // مسیر پخش daily-audio نیز حذف شده است
    const audioFile = await fetch(`${BASE}/api/v1/daily-audio/whatever/file`)
    check('مسیر daily-audio/[id]/file حذف شده → 404', audioFile.status === 404, `got=${audioFile.status}`)
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
    // آپلود صوت گزارش — مسیر حذف شده است
    const rAudio = await req('/api/v1/daily-reports/audio', { method: 'POST', cookie: supA, body: {} })
    check('آپلود صوت گزارش (مسیر حذف‌شده) → 404/405', [404, 405].includes(rAudio.status), `got=${rAudio.status}`)
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

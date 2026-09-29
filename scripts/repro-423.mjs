// Reproduce: PATCH submitted report → expect 423
const BASE = 'http://localhost:3000'
async function login(username) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ username, password: '123456' }),
  })
  return res.headers.get('set-cookie')?.split(';')[0] ?? ''
}
const sup = await login('supervisor.sa')
const md = await fetch(`${BASE}/api/v1/master`, { headers: { cookie: sup } }).then((r) => r.json())
const ws = md.data.workshops[0]
const prj = md.data.projects.find((p) => p.workshopId === ws.id) ?? md.data.projects[0]
const create = await fetch(`${BASE}/api/v1/daily-reports`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', cookie: sup },
  body: JSON.stringify({ projectId: prj.id, workshopId: ws.id, reportDate: '2026-09-16', title: 'تست ویرایش بعد از ارسال', content: 'متن آزمایشی برای بررسی وضعیت ۴۲۳', clientRequestId: crypto.randomUUID() }),
})
const cj = await create.json()
console.log('create:', create.status, JSON.stringify(cj).slice(0, 120))
const rid = cj.data.reportId
const submit = await fetch(`${BASE}/api/v1/daily-reports/${rid}/submit`, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', cookie: sup } })
console.log('submit:', submit.status)
const patch = await fetch(`${BASE}/api/v1/daily-reports/${rid}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', cookie: sup },
  body: JSON.stringify({ content: 'تغییر بعد از ارسال' }),
})
console.log('patch:', patch.status, JSON.stringify(await patch.json()).slice(0, 160))

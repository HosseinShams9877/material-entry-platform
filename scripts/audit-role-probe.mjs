// ممیزی شکست — probe audit-logs API for every role account
const BASE = 'http://localhost:3000'
const ACCOUNTS = [
  'admin', 'manager.sa', 'gm.sa', 'supervisor.sa', 'supervisor.da',
  'warehouse.sa', 'inspector.sa', 'viewer.sa', 'purchaser.sa', 'worker.sa', 'accountant.sa',
]

async function login(username) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ username, password: '123456' }),
  })
  const json = await res.json().catch(() => ({}))
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { ok: res.ok && json?.success, role: json?.data?.user?.role, cookie }
}

for (const username of ACCOUNTS) {
  const { ok, role, cookie } = await login(username)
  if (!ok || !cookie) {
    console.log(`${username.padEnd(15)} LOGIN-FAIL`)
    continue
  }
  const res = await fetch(`${BASE}/api/v1/audit-logs?page=1&pageSize=25`, { headers: { cookie } })
  const json = await res.json().catch(() => ({}))
  const n = json?.data?.logs?.length
  const total = json?.data?.pagination?.total
  console.log(
    `${username.padEnd(15)} ${String(role ?? '?').padEnd(18)} HTTP ${res.status}` +
    (res.ok ? ` logs=${n} total=${total}` : ` code=${json?.code ?? '?'} msg=${(json?.message ?? '').slice(0, 50)}`)
  )
}

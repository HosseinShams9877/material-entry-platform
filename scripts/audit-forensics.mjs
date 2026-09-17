// Forensic: find today's failed operations in audit log (LOGIN_FAILED etc.)
const BASE = 'http://localhost:3000'

async function login(username) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ username, password: '123456' }),
  })
  const json = await res.json().catch(() => ({}))
  return res.headers.get('set-cookie')?.split(';')[0] ?? ''
}

const cookie = await login('admin')
if (!cookie) { console.error('login failed'); process.exit(1) }

// pull all pages up to 400 logs, filter failures
let all = []
for (let p = 1; p <= 16; p++) {
  const res = await fetch(`${BASE}/api/v1/audit-logs?page=${p}&pageSize=25`, { headers: { cookie } })
  const json = await res.json()
  const logs = json?.data?.logs ?? []
  all.push(...logs)
  if (p * 25 >= (json?.data?.pagination?.total ?? 0)) break
}
console.log(`fetched ${all.length} logs`)

const failActions = all.filter((l) =>
  ['LOGIN_FAILED', 'TRANSCRIPTION_FAILED', 'REJECT'].includes(l.action) ||
  (l.reason && /شکست|خطا|fail/i.test(l.reason))
)
console.log(`failure-ish entries: ${failActions.length}`)
for (const l of failActions.slice(0, 40)) {
  console.log(`${l.createdAt} | ${l.action} | ${l.entityType} | user=${l.user?.fullName ?? '؟'} | ip=${l.ip} | reason=${l.reason ?? '-'}`)
}

// also: all activity from the user's LAN IP tonight
const lan = all.filter((l) => l.ip === '10.151.1.168')
console.log(`\nentries from 10.151.1.168: ${lan.length}`)
for (const l of lan.slice(0, 60)) {
  console.log(`${l.createdAt} | ${l.action} | ${l.entityType} | ${l.user?.fullName ?? '؟'}`)
}

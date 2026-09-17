// why do the new accounts fail to log in?
const BASE = 'http://localhost:3000'
for (const username of ['purchaser.sa', 'worker.sa', 'accountant.sa']) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ username, password: '123456' }),
  })
  const json = await res.json().catch(() => ({}))
  console.log(`${username}: HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`)
}

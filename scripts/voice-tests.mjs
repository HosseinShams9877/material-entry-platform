/**
 * تست استخراج هوشمند صدا — سناریوهای بند ۴۷ مسترپرامپت
 * (ASR جداگانه توسط سرویس تایید شده؛ اینجا استخراج LLM از متن تست می‌شود)
 */
const BASE = 'http://localhost:3000'

async function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' }
  if (cookie) headers['Cookie'] = cookie
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, json: await res.json().catch(() => null), setCookie: res.headers.get('set-cookie') }
}

async function login(username, password = '123456') {
  const res = await req('/api/v1/auth/login', { method: 'POST', body: { username, password } })
  return `smi_session=${/smi_session=([^;]+)/.exec(res.setCookie ?? '')?.[1]}`
}

async function main() {
  const cookie = await login('supervisor.sa')
  const scenarios = [
    { name: '۱- خرید ساده کامل', text: 'پنجاه کیسه سیمان تیپ دو از شرکت X برای پروژه سعادت‌آباد آوردیم، علی و حسن تخلیه کردن و فاکتور هم دارم.', expect: { type: 'PURCHASE', hasSupplier: true, hasProject: true, qty: 50, unit: 'کیسه', workers: 2 } },
    { name: '۲- انتقال بین کارگاه‌ها', text: 'دو تن میلگرد چهارده از کارگاه پروژه دروس به کارگاه سعادت‌آباد انتقال داده شد.', expect: { type: 'TRANSFER', hasWorkshopSource: true, qty: 2, unit: 'تن' } },
    { name: '۳- امانت', text: 'صد کیسه سیمان از کارگاه پروژه دروس امانت گرفتیم.', expect: { type: 'LOAN', qty: 100 } },
    { name: '۴- اطلاعات ناقص (سیمان بدون مبدأ)', text: 'صد کیسه سیمان آوردیم.', expect: { missingSource: true, hasQty: true } },
    { name: '۹- چند قلم در یک جمله', text: 'از شرکت X برای سعادت‌آباد سی کیسه سیمان تیپ دو و دو تن میلگرد چهارده گرفتیم.', expect: { itemsCount: 2 } },
  ]

  let pass = 0
  let fail = 0
  for (const sc of scenarios) {
    try {
      const res = await req('/api/v1/voice/extract', { method: 'POST', cookie, body: { transcript: sc.text } })
      if (res.status !== 200) {
        console.log(`❌ ${sc.name} → HTTP ${res.status}`)
        fail++
        continue
      }
      const d = res.json?.data?.draft
      const ok = []
      const bad = []
      function expect(cond, label) {
        if (cond) ok.push(label)
        else bad.push(label)
      }
      if (sc.expect.type) expect(d.type === sc.expect.type, `type=${d.type}`)
      if (sc.expect.hasSupplier) expect(!!d.sourceSupplierId, `sourceSupplier=${d.sourceLabel}`)
      if (sc.expect.hasWorkshopSource) expect(d.sourceType === 'WORKSHOP' && !!d.sourceWorkshopId, `sourceType=${d.sourceType}`)
      if (sc.expect.hasProject) expect(d.projects.length > 0, `projects=${JSON.stringify(d.projects.map((p) => p.name))}`)
      if (sc.expect.qty !== undefined) expect(d.items[0]?.quantity === sc.expect.qty, `qty=${d.items[0]?.quantity}`)
      if (sc.expect.unit) expect(d.items[0]?.unit === sc.expect.unit, `unit=${d.items[0]?.unit}`)
      if (sc.expect.workers !== undefined) expect(d.workers.length === sc.expect.workers, `workers=${d.workers.length}`)
      if (sc.expect.missingSource) expect(d.missing.includes('source'), `missing=${JSON.stringify(d.missing)}`)
      if (sc.expect.hasQty) expect(d.items[0]?.quantity === 100, `qty=${d.items[0]?.quantity}`)
      if (sc.expect.itemsCount) expect(d.items.length === sc.expect.itemsCount, `items=${d.items.length}`)

      if (bad.length === 0) {
        pass++
        console.log(`✅ ${sc.name} [${ok.join(', ')}]`)
      } else {
        fail++
        console.log(`⚠ ${sc.name} — موفق: ${ok.join(', ')} | ناموفق: ${bad.join(', ')}`)
      }
    } catch (e) {
      fail++
      console.log(`❌ ${sc.name} → خطا: ${e.message}`)
    }
  }
  console.log(`\n══ Voice: ${pass} موفق، ${fail} ناقص ══`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

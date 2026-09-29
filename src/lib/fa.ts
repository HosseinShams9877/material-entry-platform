// ─────────────────────────── ابزارهای فارسی‌سازی ───────────────────────────

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/** تبدیل ارقام لاتین به فارسی */
export function toFa(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return ''
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
}

/** تبدیل ارقام فارسی/عربی به لاتین (برای ورودی کاربر) */
export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

// ─────────────────────────── تقویم جلالی (الگوریتم استاندارد) ───────────────────────────

function div(a: number, b: number): number {
  return ~~(a / b)
}

export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    355666 + 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) + gd + g_d_m[gm - 1]
  let jy = -1595 + 33 * div(days, 12053)
  days %= 12053
  jy += 4 * div(days, 1461)
  days %= 1461
  if (days > 365) {
    jy += div(days - 1, 365)
    days = (days - 1) % 365
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return [jy, jm, jd]
}

/** تبدیل جلالی به میلادی — الگوریتم استاندارد jdf (دقت‌آزمایی‌شده با نوروزها) */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  const jy2 = jy + 1595
  let days =
    -355668 + 365 * jy2 + div(jy2, 33) * 8 + div((jy2 % 33) + 3, 4) + (jm < 7 ? (jm - 1) * 31 : (jm - 1) * 30 + 6) + jd
  let gy = 400 * div(days, 146097)
  days %= 146097
  if (days > 36524) {
    gy += 100 * div(--days, 36524)
    days %= 36524
    if (days >= 365) days++
  }
  gy += 4 * div(days, 1461)
  days %= 1461
  if (days > 365) {
    gy += div(days - 1, 365)
    days = (days - 1) % 365
  }
  let gd = days + 1
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm = 0
  for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm++) gd -= sal_a[gm]
  return [gy, gm, gd]
}

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

const JALALI_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** تاریخ و ساعت جلالی: «۱۴۰۴/۰۶/۱۹ – ۱۴:۳۰» */
export function formatJalaliDateTime(date: Date | string | null | undefined, withTime = true): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  const base = `${toFa(jy)}/${toFa(pad2(jm))}/${toFa(pad2(jd))}`
  if (!withTime) return base
  return `${base} – ${toFa(pad2(d.getHours()))}:${toFa(pad2(d.getMinutes()))}`
}

/** ───────── تقویم جلالی برای DatePicker — کار با رشتهٔ تاریخ بدون درگیری با منطقهٔ زمانی ───────── */

export const JALALI_MONTHS_LIST = JALALI_MONTHS

/** حروف کوتاه روزهای هفته (شنبه تا جمعه) برای سربرگ تقویم */
export const JALALI_WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/** برچسب ماه و سال: «شهریور ۱۴۰۴» */
export function jalaliMonthLabel(jy: number, jm: number): string {
  return `${JALALI_MONTHS[jm - 1]} ${toFa(jy)}`
}

/** طول ماه جلالی (۳۱ / ۳۰ / ۲۹ یا ۳۰ اسفند) — از طریق تبدیل معکوس، بدون جدول کبیسه */
export function jalaliMonthLength(jy: number, jm: number): number {
  const [gy1, gm1, gd1] = jalaliToGregorian(jy, jm, 1)
  const ny = jm === 12 ? jy + 1 : jy
  const nm = jm === 12 ? 1 : jm + 1
  const [gy2, gm2, gd2] = jalaliToGregorian(ny, nm, 1)
  const t1 = Date.UTC(gy1, gm1 - 1, gd1)
  const t2 = Date.UTC(gy2, gm2 - 1, gd2)
  return Math.round((t2 - t1) / 86400000)
}

/** ایندکس روز هفتهٔ اول ماه — شنبه = ۰ (چیدمان RTL تقویم جلالی) */
export function jalaliMonthFirstWeekday(jy: number, jm: number): number {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1)
  return (new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() + 1) % 7
}

/** تبدیل [jy,jm,jd] به رشتهٔ ISO تاریخ (YYYY-MM-DD) — بدون منطقهٔ زمانی */
export function jalaliToISO(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  return `${gy}-${pad2(gm)}-${pad2(gd)}`
}

/** تبدیل رشتهٔ ISO تاریخ (YYYY-MM-DD) به جلالی — بدون انحراف منطقهٔ زمانی */
export function isoToJalali(iso: string): [number, number, number] | null {
  const m = /^((\d{4})-(\d{2})-(\d{2}))/.exec(iso ?? '')
  if (!m) return null
  return gregorianToJalali(Number(m[2]), Number(m[3]), Number(m[4]))
}

/** قالب بلند از رشتهٔ ISO تاریخ: «۱۹ شهریور ۱۴۰۴» */
export function formatJalaliFromISO(iso: string | null | undefined): string {
  const p = isoToJalali(iso ?? '')
  if (!p) return '—'
  return `${toFa(p[2])} ${JALALI_MONTHS[p[1] - 1]} ${toFa(p[0])}`
}

/** تاریخ جلالی از لحظهٔ ذخیره‌شده (نیمه‌شب تهران) — با جبران آفست +۰۳:۳۰ ضد انحراف یک‌روزه */
export function formatJalaliTehran(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return formatJalaliFromISO(new Date(d.getTime() + 3.5 * 3600_000).toISOString().slice(0, 10))
}

/** روز تقویمی تهران به‌صورت ISO (YYYY-MM-DD) از لحظهٔ ذخیره‌شده — برای مقدار اولیهٔ فرم‌ها */
export function formatJalaliTehranToISO(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 3.5 * 3600_000).toISOString().slice(0, 10)
}

/** تاریخ امروز به‌وقت محلی به‌صورت ISO (YYYY-MM-DD) */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** جابه‌جایی تاریخ ISO به اندازهٔ n روز (منفی = گذشته) */
export function addDaysISO(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** «۱۹ شهریور ۱۴۰۴» */
export function formatJalaliLong(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `${toFa(jd)} ${JALALI_MONTHS[jm - 1]} ${toFa(jy)}`
}

/** نام روز هفته جلالی */
export function jalaliWeekday(date: Date): string {
  // Saturday = 0 in Jalali week
  return JALALI_WEEKDAYS[(date.getDay() + 1) % 7]
}

/** تاریخ نسبتاً خوانا: «۵ دقیقه پیش» */
export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'همین حالا'
  if (min < 60) return `${toFa(min)} دقیقه پیش`
  const h = Math.floor(min / 60)
  if (h < 24) return `${toFa(h)} ساعت پیش`
  const days = Math.floor(h / 24)
  if (days < 7) return `${toFa(days)} روز پیش`
  return formatJalaliDateTime(d, false)
}

/** باقی‌مانده زمان تا مهلت ویرایش (قانون ۲۴ ساعت) */
export function formatTimeRemaining(deadline: Date | string | null): string {
  if (!deadline) return ''
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return 'منقضی شده'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 0) return `${toFa(h)} ساعت و ${toFa(m)} دقیقه`
  return `${toFa(m)} دقیقه`
}

/** مقدار Quantity با حداکثر ۲ رقم اعشار فارسی و جداکنندهٔ هزارگان فارسی */
export function formatQty(q: number): string {
  const rounded = Math.abs(q % 1) < 0.005 ? Math.round(q) : Math.round(q * 100) / 100
  return toFa(rounded.toLocaleString('en-US')).replace(/,/g, '٬')
}

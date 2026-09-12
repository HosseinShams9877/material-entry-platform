# سامانهٔ هوشمند ثبت ورود مصالح کارگاه

پلتفرم موبایل‌اول ثبت ورود مصالح (دستی + صوتی با هوش مصنوعی)، جریان تأیید مدیریتی، **ماژول وظایف و گزارش روزانه کارگاه**، تقویم شمسی پاپ‌آپ و رابط فارسی راست‌به‌چپ.

## راه‌اندازی سریع

پیش‌نیاز: [Bun](https://bun.sh) (یا Node.js 20+ با npm/pnpm)

```bash
bun install                # نصب وابستگی‌ها
bun run db:generate        # تولید Prisma Client
bun run db:deploy          # اعمال Migrationها (تولید) — یا db:push برای توسعه
bun run dev                # اجرای محیط توسعه روی http://localhost:3000
```

دیتابیس آماده (`db/custom.db`) به‌همراه داده‌های اولیه ضمیمه است؛ در صورت نیاز به دادهٔ تازه:

```bash
bunx tsx scripts/seed.ts   # بازسازی داده‌های اولیه (شامل Permissionهای جدید)
```

## حساب‌های آزمایشی (گذرواژهٔ همه: `123456`)

| نقش | نام کاربری |
|---|---|
| مدیر سیستم | `admin` |
| مدیر پروژه سعادت‌آباد | `manager.sa` |
| سرپرست سعادت‌آباد | `supervisor.sa` |
| سرپرست دروس | `supervisor.da` |

## تست‌ها

```bash
bun scripts/security-tests.mjs       # ۳۸ تست امنیتی (IDOR، قفل ۲۴ ساعته، CSRF، ...)
bun scripts/daily-tasks-tests.mjs    # ۶۷ تست ماژول وظایف/گزارش روزانه
bun scripts/voice-tests.mjs          # ۵ تست استخراج هوش صوتی
bun scripts/delivery-date-tests.mjs  # ۵ تست تاریخ ورود مصالح (جلالی)
bun scripts/production-tests.mjs     # ۲۷ تست سخت‌سازی تولید
```

## ماژول وظایف و گزارش روزانه

- سرپرست: کارت «وظایف روزانه» و «گزارش روزانه» در خانه + تب «وظایف» در ناوبری پایین
- مدیر پروژه/ادمین: تب «روزانه» در ناوبری پایین (داشبورد وظایف، تأخیرها، گزارش‌ها، Timeline)
- مدیر کارگاه: «وظیفهٔ روزانه جدید» از صفحهٔ وظایف (فرم دستی/صوتی + آیتم‌سازی از متن)
- مستندات کامل: `docs/DAILY-TASKS.md`

## ساختار مهم

- `src/components/app/` — رابط کاربری (تمام صفحات، تقویم جلالی پاپ‌آپ: `jalali-calendar-sheet.tsx`)
- `src/lib/fa.ts` — توابع تقویم جلالی و فارسی‌سازی ارقام
- `src/app/api/v1/` — API لایه‌بندی‌شده (auth، material-entries، voice، admin، ...)
- `prisma/schema.prisma` — مدل داده
- `uploads/` — فایل‌های خصوصی (خارج از public؛ فقط با Signed URL)
- `docs/ARCHITECTURE.md` — معماری کامل (State Machine، ماتریس دسترسی، Scope Chain)
- `download/` — بستهٔ تحویل (راهنما، معماری، اسکرین‌شات‌های راستی‌آزمایی)

## استقرار تولید

```bash
bun run build
bun run start
```

جزئیات کامل معماری و امنیت: `download/README.md` و `docs/ARCHITECTURE.md`

## حساب‌های آزمایشی (گذرواژه همه: 123456)

| حساب | نقش | دسترسی |
|------|-----|--------|
| `admin` | مدیر ارشد سیستم | همه‌جا |
| `manager.sa` | مدیر پروژه | پروژه‌های سعادت‌آباد + بررسی/بستن/Rollback |
| `warehouse.sa` | انباردار | تأیید انبار و تحویل |
| `inspector.sa` | ناظر کنترل کیفیت | بررسی فنی |
| `supervisor.sa` | سرپرست سعادت‌آباد | ثبت/گزارش/وظایف |
| `supervisor.da` | سرپرست دروس | ثبت/گزارش/وظایف |
| `viewer.sa` | بیننده | فقط مشاهده (Scope خودش) |

## تست‌ها
```bash
npm run test:enterprise   # زنجیرهٔ Workflow + RBAC + Idempotency + … (۵۶)
npm run test:daily        # ماژول وظایف روزانه (۶۷)
bun scripts/security-tests.mjs    # امنیتی (۳۸)
bun scripts/production-tests.mjs  # Production (۲۷)
bun scripts/voice-tests.mjs       # صوتی (۵)
bun scripts/delivery-date-tests.mjs # تاریخ جلالی (۵)
```

## پشتیبان‌گیری
```bash
npm run db:backup   # VACUUM INTO (SQLite) یا pg_dump (PostgreSQL)
npm run db:restore  # RESTORE_FILE=backups/db-….db npm run db:restore
```

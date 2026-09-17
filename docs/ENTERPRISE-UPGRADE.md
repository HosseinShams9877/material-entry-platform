# Enterprise Upgrade — مهاجرت سامانه ثبت ورود مصالح به سطح Enterprise

تاریخ: ۱۴۰۵/۰۶/۱۹ — نسخهٔ Enterprise 1.0

این سند خلاصهٔ کامل ارتقای Enterprise را پوشش می‌دهد: زنجیرهٔ Workflow حرفه‌ای، RBAC توسعه‌یافته،
لایهٔ Object Storage، Idempotency، Offline Sync، کانال‌های اعلان، KPI داشبورد، Session Hardening،
PostgreSQL readiness و استقرار Docker.

---

## ۱) زنجیرهٔ حرفه‌ای Workflow

مسیر کامل هر ثبت ورود مصالح:

```
DRAFT → SUBMITTED → TECH_REVIEW → TECH_REVIEWED → APPROVED →
WAREHOUSE_CONFIRMED → DELIVERED → CLOSED
```

- **مسیر مستقیم**: SUBMITTED/PENDING_REVIEW → APPROVED (بدون بررسی فنی) همچنان مجاز است — سازگار با جریان قبلی، هیچ قابلیتی حذف نشده.
- **بررسی فنی**: START توسط ناظر (`entry.techReview`) → COMPLETE با نظر فنی.
- **تأیید انبار و تحویل**: انباردار (`entry.warehouse`) — حتی برای ثبت‌های قفل‌شده (LOCKED) ادامهٔ زنجیره مجاز است.
- **بستن**: مدیر پروژه/کارگاه (`entry.close`).
- **برگشت مرحله (Rollback)**: `entry.rollback` (مدیر پروژه/کارگاه/ادمین) — به مرحلهٔ قبل با پاک‌سازی مهر زمانی همان مرحله؛ تاریخچهٔ تصمیم قبلی هرگز حذف نمی‌شود.
- **تاریخچهٔ مراحل**: مدل `EntryStageLog` — هر گذر/برگشت با Action، انجام‌دهنده، یادداشت و زمان UTC. در API جزئیات (`stageLogs`) و UI ثبت (Timeline) نمایان است.

### APIهای جدید (POST، همه با مجوز/Scope/Rate Limit)

| مسیر | مجوز | توضیح |
|------|------|-------|
| `/api/v1/material-entries/[id]/tech-review` | `entry.techReview` | `{action: START\|COMPLETE, note}` |
| `/api/v1/material-entries/[id]/warehouse-confirm` | `entry.warehouse` | `{note}` |
| `/api/v1/material-entries/[id]/deliver` | `entry.warehouse` | `{note}` |
| `/api/v1/material-entries/[id]/close` | `entry.close` | `{note}` |
| `/api/v1/material-entries/[id]/rollback` | `entry.rollback` | `{reason}` |

---

## ۲) RBAC توسعه‌یافته — ۸ نقش

نقش‌های جدید (علاوه بر ۵ نقش قبلی):

| نقش | مجوزهای کلیدی |
|-----|----------------|
| `WAREHOUSE_MANAGER` انباردار | `entry.warehouse`، مشاهده گزارش/حسابرسی |
| `INSPECTOR` ناظر کنترل کیفیت | `entry.techReview`، مشاهده وظایف/گزارش |
| `VIEWER` بیننده | فقط مشاهده در Scope خودش |

مجوزهای جدید: `entry.techReview`, `entry.warehouse`, `entry.close`, `entry.rollback`.
حساب‌های آزمایشی: `warehouse.sa`, `inspector.sa`, `viewer.sa` (گذرواژه: 123456).

---

## ۳) Session Hardening

- **اتصال UA (ضد Hijacking)**: اگر User-Agent نشست ثبت‌شده با درخواست فعلی فرق کند، نشست باطل می‌شود (`SESSION_BIND_UA=1` پیش‌فرض).
- **تمدید لغزان (Refresh Effect)**: با هر فعالیت معتبر، اگر بیش از نیمی از عمر نشست گذشته باشد، TTL تمدید و کوکی بازنویسی می‌شود (`SESSION_SLIDING=1` پیش‌فرض).
- Hashing scrypt، نشست هش‌شده در DB، ابطال اجباری — از قبل موجود.

---

## ۴) Object Storage (S3/MinIO)

لایهٔ انتزاع `src/lib/storage.ts` با دو ارائه‌دهنده:

- `STORAGE_PROVIDER=local` (پیش‌فرض) — فایل‌سیستم `UPLOAD_DIR` با مهار مسیر.
- `STORAGE_PROVIDER=s3` — هر سرویس سازگار S3 با **AWS Signature V4** پیاده‌سازی‌شده بومی (بدون SDK اضافه): MinIO، AWS، Wasabi و …

متادیتای فایل: نام امن، آپلودکننده، زمان، کارگاه/پروژه (از ثبت)، `version`، `storageProvider` (LOCAL|S3).

### Versioning پیوست

- `POST /api/v1/attachments/[id]/version` — نسخهٔ جدید فایل؛ رکورد قبلی با `replacedById` به نسخهٔ بعدی زنجیر می‌شود؛ تاریخچهٔ نسخه‌ها قابل مشاهده/دانلود است؛ جایگزینی نسخهٔ قدیمی → 409 SUPERSEDED.

---

## ۵) Idempotency و Offline Sync

### سرور
- `MaterialEntry.clientRequestId` و `DailyReport.clientRequestId` (@unique).
- POST با `clientRequestId` تکراری (همان کاربر) → پاسخ رکورد موجود با `duplicate:true` (بدون رکورد دوم).
- همان ID با کاربر دیگر → 409 CLIENT_REQUEST_CONFLICT (جداسازی مالکیت).

### کلاینت (PWA)
- `src/lib/offline.ts` — Outbox در IndexedDB با `clientRequestId` (UUID).
- قطع اتصال هنگام ثبت/گزارش → صف + پیام «در صف ارسال خودکار».
- Sync: رویداد `online`، تایمر ۳۰ ثانیه، پیام Background Sync از Service Worker.
- حذف از صف فقط در موفقیت/تکرار؛ خطای ۴xx (غیر ۴۰۱/۴۲۹) → حذف؛ خطای شبکه → ماندن.
- نوار وضعیت صف در Shell (شمارندهٔ «درخواست در صف ارسال خودکار»).

---

## ۶) کانال‌های اعلان (SMS/Email/Push)

`src/lib/notify-channels.ts` — هر کانال یک Webhook از Environment (سازگار با درگاه‌های ایرانی/FCM/OneSignal):

```
NOTIFY_SMS_WEBHOOK_URL=    →  POST {phone, message, userId, entityId}
NOTIFY_EMAIL_WEBHOOK_URL=  →  POST {email, subject, body, …}
NOTIFY_PUSH_WEBHOOK_URL=   →  POST {userId, title, body, type, …}
```

- تحویل غیرهمزمان و ضدخطا — هرگز جریان اصلی نمی‌شکند.
- **لاگ تحویل کامل**: مدل `NotificationDelivery` (SENT/FAILED/SKIPPED + جزئیات) برای ممیزی.
- فیلد `User.email` برای مسیر ایمیل اضافه شد.

---

## ۷) داشبورد Enterprise

شاخص‌های جدید در `/api/v1/dashboard` (شاخهٔ مدیر) و UI داشبورد:

- **KPI Cards**: میانگین زمان تأیید (دقیقه، ۳۰ روز)، تأخیر تأیید >۲۴ ساعت، وظایف باز، وظایف انجام‌شدهٔ امروز، گزارش‌های امروز.
- **Line Chart**: روند ثبت مصالح ۱۴ روز (Recharts، ارقام/برچسب جلالی RTL-safe).
- **Bar Chart**: وضعیت (تأیید/در انتظار/رد) به تفکیک کارگاه.
- **عملکرد سرپرستان**: تعداد/تأیید/رد/میانگین تأیید در ۳۰ روز.
- فیلتر بررسی شامل TECH_REVIEW و تمام KPIها Scope-aware است.

---

## ۸) PostgreSQL readiness

- `prisma/postgres/schema.prisma` — همان مدل‌ها با provider=postgresql (بازتولید خودکار: `npm run db:pg-schema`).
- استقرار: `DATABASE_URL="postgresql://…" npx prisma migrate deploy --schema prisma/postgres/schema.prisma`
- راهنمای کامل: `docs/POSTGRES-MIGRATION.md`.

### Backup / Restore

```bash
npm run db:backup    # SQLite: VACUUM INTO (اسنپ‌شات تمیز) — PostgreSQL: pg_dump
npm run db:restore   # SQLite: RESTORE_FILE=backups/db-…db npm run db:restore (پشتیبان اطمینان خودکار)
BACKUP_KEEP=30       # نگهداری ۳۰ نسخهٔ آخر
```

---

## ۹) Docker Deployment

```bash
cp .env.example .env   # مقادیر Secret را پر کنید
docker compose up -d --build
```

- `Dockerfile`: Multi-stage (bun build → node:22-alpine runtime، کاربر غیر root، standalone output، deploy migration در startup).
- `docker-compose.yml`: app + **postgres:16** + **minio** (با healthcheck و bucket-init).
- ساخت با SQLite: `docker build --build-arg SCHEMA=sqlite .` / با PostgreSQL: `--build-arg SCHEMA=postgres`.

---

## ۱۰) تست‌ها — ۱۹۸ سناریو

| سوئیت | اجرا | تعداد |
|-------|------|-------|
| Enterprise (جدید) | `npm run test:enterprise` | ۵۶ |
| ماژول روزانه | `npm run test:daily` | ۶۷ |
| امنیتی | `bun scripts/security-tests.mjs` | ۳۸ |
| Production | `bun scripts/production-tests.mjs` | ۲۷ |
| صوتی | `bun scripts/voice-tests.mjs` | ۵ |
| تاریخ جلالی | `bun scripts/delivery-date-tests.mjs` | ۵ |

پوشش Enterprise: RBAC نقش‌های جدید و IDOR بین‌کارگاهی، زنجیرهٔ کامل ۷ مرحله‌ای با تاریخچه، Rollback و مجوزها، Idempotency (تکرار/کاربر دیگر)، عکس اثبات (MIME جعلی/Scope متقابل/متادیتا)، Versioning فایل، KPI داشبورد، اعلان‌ها، اتصال UA، پشتیبان‌گیری.

---

## دروازهٔ کیفیت

- `npm run lint` — صفر خطا/هشدار
- `npx tsc --noEmit` — صفر خطا
- `npm run build` — موفق (standalone)
- `npx prisma migrate deploy` — بدون خطا (migration: `2_enterprise_workflow_rbac`)

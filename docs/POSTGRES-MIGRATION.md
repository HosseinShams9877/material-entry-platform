# مهاجرت از SQLite به PostgreSQL

SQLite برای حجم کاری فعلی (کارگاه‌های کوچک، تک‌نمونه) کافی است؛ اما برای
استقرار چندنمونه‌ای، هم‌زمانی بالا یا حجم دادهٔ زیاد PostgreSQL توصیه می‌شود.
این سند مسیر مهاجرت بدون تغییر کد اپلیکیشن است.

## ۱. تغییر Provider

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`DATABASE_URL` جدید:

```
DATABASE_URL=postgresql://user:pass@host:5432/smi?schema=public&sslmode=require
```

## ۲. تفاوت‌های شناخته‌شده در این پروژه

| مورد | SQLite (فعلی) | PostgreSQL |
|---|---|---|
| Enumها | رشته + اعتبارسنجی Zod (`src/lib/validate.ts`) | می‌توان به `enum` واقعی تبدیل کرد (اختیاری) |
| `contains` جستجو | حساس به حروف (Prisma روی SQLite) | پیش‌فرض حساس؛ برای فارسی `mode: 'insensitive'` لازم نیست (فارسی Case ندارد) |
| `db push` | استفادهٔ توسعه | ممنوع — فقط `migrate deploy` |
| tranaction concurrency | Writer واحد | MVCC — Retry‌های P2002 ما همچنان معتبرند |

⚠️ در `src/lib/api.ts` و فیلترهای `contains` نیازی به تغییر نیست — Prisma
سینتکس را روی هر دو دیتابیس پشتیبانی می‌کند.

## ۳. مراحل انتقال داده

```bash
# 1) اسکیمای مقصد
bunx prisma migrate deploy          # روی DATABASE_URL جدید

# 2) انتقال داده (دو مسیر)
#    الف) حجم کم: خروجی/ورودی SQL
sqlite3 db/custom.db .dump > dump.sql
#    تبدیل دستی دنباله‌های AUTOINCREMENT در صورت وجود، سپس:
psql "$DATABASE_URL" < dump.sql

#    ب) حجم بالا/ساختار متفاوت: ابزار ETL
bunx prisma-db-pull   # (بررسی) — یا pgloader:
# pgloader sqlite:///home/user/db/custom.db postgresql://user:pass@host/smi
```

## ۴. بازسازی Client و راستی‌آزمایی

```bash
bun run db:generate
bun run typecheck
bun scripts/security-tests.mjs    # ۳۸ تست — همه باید سبز شوند
bun scripts/production-tests.mjs  # تست‌های Production
```

## ۵. رول‌بک

دیتابیس قبلی SQLite را حذف نکنید تا اطمینان از صحت مهاجرت (تعداد رکوردها،
Checksum نمونه‌ای، تست Workflow). در صورت مشکل، `provider` را برگردانید و با
همان `DATABASE_URL` قبلی اجرا کنید.

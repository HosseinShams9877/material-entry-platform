# راهنمای استقرار Production

## پیش‌نیازها

- Node.js 20+ یا Bun 1.1+
- Reverse Proxy با HTTPS (Caddy/Nginx) — کوکی Secure نیازمند HTTPS است
- دیسک پایدار برای دیتابیس SQLite و پوشهٔ Uploads (یا PostgreSQL — سند جدا)

## ۱. متغیرهای محیطی (الزامی)

از `.env.example` کپی کنید. **در Production نبود `SIGNED_URL_SECRET` باعث توقف سرور با خطای واضح می‌شود:**

```bash
cp .env.example .env
export SIGNED_URL_SECRET="$(openssl rand -hex 32)"
```

| متغیر | الزامی؟ | پیش‌فرض | توضیح |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | SQLite: `file:../db/custom.db` (نسبی به پوشهٔ `prisma/`) |
| `SIGNED_URL_SECRET` | ✅ در Prod | ❌ ندارد | حداقل ۳۲ کاراکتر — `openssl rand -hex 32` |
| `UPLOAD_DIR` | اختیاری | `<cwd>/uploads` | پوشهٔ فایل‌های خصوصی؛ در Docker یک Volume |
| `SIGNED_URL_TTL_MS` | اختیاری | `600000` | مدت اعتبار لینک فایل (۱۰ دقیقه) |
| `SESSION_TTL_DAYS` | اختیاری | `30` | عمر نشست کاربر |
| `TRUST_PROXY` | اختیاری | `false` در Prod | فقط پشت Reverse Proxy معتمد `true` کنید |
| `COOKIE_SECURE` | اختیاری | `true` در Prod | فقط برای استقرار داخلی بدون HTTPS `false` (ریسک در خودتان است) |

## ۲. Build و اجرا

```bash
bun install            # یا npm ci
bun run db:deploy      # prisma migrate deploy — Migration امن؛ db:push در Production ممنوع
bun run typecheck      # tsc --noEmit
bun run lint           # eslint
bun run build          # next build (خطای TS = شکست Build)
bun run start          # اجرای standalone server روی پورت 3000
```

## ۳. Migration دیتابیس

- جریان رسمی: `prisma migrate deploy` (بدون accept-data-loss).
- Migration پایه: `prisma/migrations/0_init` — از قبل «applied» علامت خورده است.
- تغییر اسکیما در توسعه: `bun run db:migrate` → کامیت پوشهٔ `prisma/migrations`.
- ⚠️ `bun run db:push` فقط برای توسعه محلی است.

## ۴. نگهداری دوره‌ای

```bash
# پاک‌سازی فایل‌های یتیم (Cron روزانه پیشنهادی)
bun run cleanup:uploads        # dry-run — فقط گزارش
bun run cleanup:uploads:apply  # حذف واقعی
```

- نشست‌های منقضی به‌صورت خودکار و throttleشده در هر Login پاک می‌شوند.
- لاگ‌ها JSON ساختاریافته‌اند (`level/scope/msg/meta`) — با کلکسیونر لاگ جمع‌آوری کنید.

## ۵. چک‌لیست امنیتی استقرار

- [ ] `SIGNED_URL_SECRET` قوی و در Secret Manager/Env — هرگز در کد
- [ ] HTTPS فعال؛ `COOKIE_SECURE` دست‌نخورده (true)
- [ ] `TRUST_PROXY=true` فقط اگر پشت Proxy معتمدید
- [ ] پوشهٔ `uploads/` خارج از `public/` و غیرقابل دسترسی مستقیم وب
- [ ] فایل `db/` و `.env` خارج از Web Root
- [ ] Backup دوره‌ای: `db/custom.db` + `uploads/`
- [ ] Rate Limitهای Login/Upload/Voice فعال‌اند (in-memory؛ برای چند نمونه سند RATelimit-Redis را ببینید)

## ۶. چندنمونه‌ای (Scale-out)

Rate Limiter فعلی In-Memory است (در هر نمونه مستقل). برای اجرای چند Instance:
از یک لایهٔ مشترک استفاده کنید — رابط `rateLimit()` در `src/lib/ratelimit.ts`
به‌سادگی با Redis (`INCR` + `PEXPIRE`) یا پرچم Upstash قابل تعویض است؛ قرارداد تابع تغییر نمی‌کند.

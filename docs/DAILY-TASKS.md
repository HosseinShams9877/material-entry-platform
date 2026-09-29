# ماژول وظایف و گزارش روزانه کارگاه

این سند معماری، دسترسی‌ها، APIها، متغیرهای محیطی و راهنمای استقرار ماژول «وظایف روزانه» را توضیح می‌دهد.

## ۱) نمای کلی

مدیر کارگاه (یا ادمین) وظایف روزانه را برای سرپرست کارگاه ایجاد و ارسال می‌کند — به‌صورت متن دستی یا صوت. صوت پس از آپلود به متن تبدیل می‌شود و متن می‌تواند با کمک LLM به آیتم‌های اجرایی قابل تیک‌زدن تبدیل گردد. سرپرست هر آیتم را پس از انجام تیک می‌زند (زمان و نام انجام‌دهنده ثبت می‌شود) و گزارش روزانه (متن یا صوت) برای مدیران ارسال می‌کند. مدیر پروژه وضعیت، درصد پیشرفت، وظایف دارای تأخیر، گزارش‌ها و صوت‌ها را در داشبورد «روزانه» مشاهده می‌کند.

## ۲) مدل داده (Prisma)

| مدل | نقش |
|---|---|
| `DailyTask` | وظیفه روزانه — وضعیت‌ها: `DRAFT → PENDING → IN_PROGRESS → COMPLETED / CANCELLED` |
| `TaskAssignee` | واسط چند-به-چن وظیفه↔سرپرست (`@@unique([taskId,userId])`) |
| `DailyTaskItem` | آیتم‌های قابل تیک‌زدن با `completedAt/ById/Note` مستقل |
| `DailyReport` | گزارش روزانه — وضعیت‌ها: `DRAFT → SUBMITTED → REVIEWED` |
| `TaskComment` | گفتگوی متنی/صوتی روی وظیفه |
| `DailyAudio` | فرادادهٔ مشترک فایل صوتی (`kind: TASK/REPORT/COMMENT`، `transcribeStatus: NONE/DONE/FAILED`) |

ایندکس‌ها: `DailyTask(projectId)`, `DailyTask(workshopId,status)`, `DailyTask(assignedDate)`, `DailyTask(status,dueDate)`, `DailyTask(createdAt)`, `TaskAssignee(userId)`, `DailyTaskItem(taskId,sortOrder)`, `DailyReport(reportDate)`, `DailyReport(status,submittedAt)` و غیره.

قواعد زمان: همهٔ لحظه‌ها UTC ذخیره می‌شوند؛ «تاریخ» وظیفه/گزارش نیمه‌شب تهران (+03:30 ثابت) به UTC تبدیل می‌شود و در UI با تقویم جلالی نمایش می‌یابد.

## ۳) نقش‌ها و دسترسی‌ها

| عملیات | SUPER_ADMIN/ADMIN | WORKSHOP_MANAGER | WORKSHOP_SUPERVISOR | PROJECT_MANAGER |
|---|---|---|---|---|
| ایجاد/ویرایش/ارسال/لغو وظیفه | ✔ | ✔ (`task.create/edit/assign/cancel`) | ✖ | ✖ |
| مشاهده وظایف | ✔ (همه) | کارگاه خودش | فقط وظایف Assignee‌شده به خود | پروژه‌های خودش |
| تیک‌زدن/برداشتن تیک آیتم | ✔ | ✖ | ✔ (`task.complete`) | ✖ |
| ثبت گزارش روزانه (متن/صوت) | ✔ | ✖ | ✔ (`report.create/edit/submit`) | ✖ |
| بررسی گزارش | ✔ | ✔ (`report.review`) | ✖ | ✔ |
| مشاهده صوت‌ها | ✔ | کارگاه خودش | صوت وظایف خود | پروژه‌های خودش |

- تمام APIها از `apiHandler` (Auth + RBAC + Zod + CSRF + Rate Limit) عبور می‌کنند.
- فیلتر Scope داخل خود Query اعمال می‌شود (ضد IDOR)؛ شناسهٔ گیرنده در ارسال باید سرپرستِ فعالِ همان کارگاه باشد.
- پخش/دانلود صوت فقط با Signed URL (HMAC با TTL) یا نشست دارای Scope؛ فایل خارج از `public` ذخیره شده و نام آن سرساخت است.

## ۴) APIها

```
GET    /api/v1/daily-tasks                          ?status&projectId&workshopId&assigneeId&date&from&to&overdue&mine&q&page
POST   /api/v1/daily-tasks                          (ایجاد پیش‌نویس — دستی یا صوتی)
GET    /api/v1/daily-tasks/[id]
PATCH  /api/v1/daily-tasks/[id]                     (ویرایش تا پیش از تکمیل؛ آیتم انجام‌شده حذف نمی‌شود)
DELETE /api/v1/daily-tasks/[id]                     (فقط پیش‌نویس)
POST   /api/v1/daily-tasks/[id]/send                { assigneeIds? }
POST   /api/v1/daily-tasks/[id]/cancel              { reason }
POST   /api/v1/daily-tasks/[id]/complete            { note? }  ← تکمیل همهٔ آیتم‌ها + وظیفه
POST   /api/v1/daily-tasks/[id]/items/[itemId]/complete   { note? }
POST   /api/v1/daily-tasks/[id]/items/[itemId]/uncomplete
GET|POST /api/v1/daily-tasks/[id]/comments          { content, audioId? }
POST   /api/v1/daily-tasks/audio                    multipart(audio) — صوت دستور + STT
POST   /api/v1/daily-tasks/extract-items            { transcript } ← آیتم‌سازی با LLM (پیشنهادی؛ تأیید مدیر الزامی)
GET    /api/v1/daily-reports                        ?status&projectId&workshopId&date&from&to
POST   /api/v1/daily-reports                        (پیش‌نویس گزارش)
GET|PATCH /api/v1/daily-reports/[id]
POST   /api/v1/daily-reports/[id]/submit
POST   /api/v1/daily-reports/[id]/review            { note? }
POST   /api/v1/daily-reports/audio                  multipart(audio) — صوت گزارش + STT
GET    /api/v1/daily-audio/[id]/file                ?token=… (Signed URL) یا نشست Scopeدار
GET    /api/v1/daily-dashboard                      شمارنده‌ها، تأخیرها، گزارش‌ها، Timeline
```

پاسخ‌ها با قالب استاندارد `{ success, data }` / `{ success:false, code, message }` و خطاهای تفکیک‌شده: 401/403/404/409/413/415/422/423/429/502.

## ۵) اعلان‌ها (Notification)

`TASK_SENT`، `TASK_UPDATED`، `TASK_ITEM_COMPLETED`، `TASK_COMPLETED` (به ایجادکننده + مدیران پروژه)، `TASK_CANCELLED`، `REPORT_SUBMITTED` (مدیران کارگاه + پروژه)، `REPORT_REVIEWED`، `TRANSCRIPTION_FAILED`، `TASK_DUE_SOON` و `TASK_OVERDUE` (سنجش تنبل مهلت‌ها هنگام لیست‌کشی، حداکثر هر ۳۰ دقیقه).

## ۶) متغیرهای محیطی جدید

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `AUDIO_MAX_MB` | `15` | سقف حجم فایل صوتی |
| `STT_PROVIDER` | `z-ai` | `z-ai` | `external` | `none` |
| `STT_LANGUAGE` | `fa` | زبان تبدیل گفتار |
| `STT_API_URL` | — | فقط برای `external` |
| `STT_API_KEY` | — | فقط از Environment؛ هرگز در کلاینت |

(`SIGNED_URL_SECRET`, `SIGNED_URL_TTL_MS`, `UPLOAD_DIR` و بقیه مطابق سند PRODUCTION-DEPLOYMENT.md)

## ۷) راهنمای Migration و اجرای محلی

```bash
# ۱) نصب و تولید کلاینت
bun install && bun run db:generate

# ۲) اعمال Migrationها (پیشنهادی برای Production/تیم)
bun run db:deploy          # prisma migrate deploy — مهاجرت 0_init و 1_add_daily_tasks

# توسعه از صفر (بدون حفظ داده):
bun run db:push            # یا: bun run db:migrate

# ۳) داده اولیه (Permissions/نقش‌ها/حساب‌های آزمایشی) — idempotent
bunx tsx scripts/seed.ts

# ۴) اجرا
bun run dev                # http://localhost:3000

# ۵) تست‌ها
bun scripts/daily-tasks-tests.mjs    # یا: npm run test:daily
```

نکته: دیتابیس توسعه (`db/custom.db`) از قبل با `db push` همگام شده و مهاجرت `1_add_daily_tasks` با `prisma migrate resolve --applied` ثبت شده است؛ روی محیط تازه، `prisma migrate deploy` همان اسکیمای این مهاجرت را اعمال می‌کند.

## ۸) جریان صوتی

1. ضبط با MediaRecorder یا انتخاب فایل (کد‌سمت کلاینت: سقف حجم، MIME اعلانی)
2. سرور: Magic Bytes (MP3/WAV/WebM/OGG/M4A) + هم‌خوانی پسوند + سقف حجم + گارد Content-Length پیش از Parse
3. ذخیره با نام سرسخت داخل `UPLOAD_DIR` (خارج از public) + Rollback در شکست ثبت DB
4. `SpeechToTextProvider` (`src/lib/stt.ts`): `z-ai` داخلی، `external` HTTP، `none`
5. شکست سرویس → فایل حفظ، `transcribeStatus=FAILED`، اعلان به کاربر، ورود دستی متن
6. متن قابل ویرایش → `extract-items` با LLM → آیتم‌ها پیش از ارسال توسط مدیر ویرایش/تأیید می‌شوند (وظیفهٔ صوتی بدون تأیید هرگز ارسال نمی‌شود)

## ۹) تست‌ها (scripts/daily-tasks-tests.mjs — ۶۷ سناریو)

ایجاد دستی/صوتی، اعتبارسنجی‌ها، CSRF/401، IDOR کامل (لیست/جزئیات/تیک/صوت/گزارش)، ارسال به سرپرست بیگانه، چرخهٔ تیک/برداشتن تیک + Audit، تکمیل خودکار + زمان‌ها، اعلان‌ها (SENT/UPDATED/COMPLETED/CANCELLED/SUBMITTED/REVIEWED)، ویرایش/لغو/حذف با وضعیت‌های مجاز، MIME جعلی، پسوند ناسازگار، فایل بزرگ، Path Traversal، استفادهٔ مجدد صوت، Signed URL معتبر/منقضی/جعلی، استخراج آیتم با LLM، فیلترها، داشبورد روزانه.

## ۱۰) محدودیت‌ها و نکات باقی‌مانده

- پیوست تصویر برای آیتم‌ها فعلاً پشتیبانی نمی‌شود (زیرساخت Attachment فعلی به MaterialEntry مقید است) — آیتم‌ها توضیح متنی و گفتگوی صوتی دارند.
- «گزارش به‌عنوان بازدیدشده» به‌صورت REVIEWED ثبت می‌شود؛ تفکیک «فقط مشاهده» نیازمند تصمیم محصولی است.
- Rate Limiter درون-حافظه‌ای است (مطابق معماری فعلی)؛ برای چند نمونه (multi-instance) به Redis نیاز است.
- افست تهران (+03:30) ثابت فرض شده (ایران از ۱۴۰۱ DST ندارد).

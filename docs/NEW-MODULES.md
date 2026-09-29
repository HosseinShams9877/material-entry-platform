# مستندات سه ماژول جدید — صورت وضعیت، اعلام نیاز/خرید، گزارش کار

> تاریخچه: این ماژول‌ها در چارچوب درخواست کارفرما اضافه شدند: «مهم‌ترین بخش‌ها صورت وضعیت، گزارش کارها، اعلام گزارش کار توسط خودش، دسترسی آسان و روان — یک نرم‌افزار کاملاً معمولی؛ کنترل خریدها بدون بخش مالی؛ صورت وضعیت بالای ۱۵۰ میلیون نیازمند امضای مدیر کل؛ حذف کامل تبدیل ویس به نوشتار».

## ۱) صورت وضعیت (Progress Statement)

### مدل داده — `ProgressStatement`
| فیلد | توضیح |
|---|---|
| `number` | شمارهٔ ترتیبی یکتا (تولید اتمی + Retry روی P2002) |
| `title` / `periodText` / `description` | عنوان، دوره (مثلاً «مهر ۱۴۰۵»)، شرح |
| `amount` | مبلغ به **تومان** (BigInt) — تنها عدد مالی سامانه؛ هیچ ماژول پرداخت/فاکتور وجود ندارد |
| `needsGmSign` | snapshot در لحظهٔ ایجاد/ویرایش: `amount > 150,000,000` |
| `status` | `DRAFT → SUBMITTED → APPROVED → (PENDING_GM_SIGN → SIGNED)` یا `REJECTED` |
| `signaturePath` | فایل PNG امضای مدیر کل (خصوصی، فقط با Signed URL) |
| `approvedBy/signedBy/rejectedBy` | ردپای کامل actors با زمان |

### گردش کار
```
سرپرست/مدیر: ایجاد (DRAFT) → ارسال (SUBMITTED)
مدیر (statement.approve + Scope کارگاه/پروژه):
   ├── مبلغ ≤ ۱۵۰م تومان → APPROVED (نهایی)
   └── مبلغ > ۱۵۰م تومان → PENDING_GM_SIGN + اعلان به مدیر کل
مدیر کل (فقط نقش GENERAL_MANAGER): امضای دستی روی پد (PNG با Sharp بازپردازش) → SIGNED (نهایی)
رد: مدیر روی SUBMITTED یا مدیر کل روی PENDING_GM_SIGN — با ثبت علت الزامی
```

### نکات امنیتی
- امضا فقط با `user.role === 'GENERAL_MANAGER'` (حتی SUPER_ADMIN اجازه ندارد — «امضا از خود مدیر کل»)
- تصویر امضا: Magic Bytes PNG + بازپردازش Sharp (حذف متادیتا) + سقف ۳۰۰KB + مهار مسیر + rollback فایل در خطای DB
- نمایش امضا با Signed URL (HMAC + TTL) و مسیر دوم مبتنی بر Scope

### آستانه
ثابت `GM_SIGN_THRESHOLD_TOMAN = 150_000_000` در `src/lib/permissions.ts` — بدون ENV برای سادگی پشتیبانی.

## ۲) اعلام نیاز و کنترل خرید (Purchase Request) — بدون بخش مالی

### مدل داده — `PurchaseRequest` + `PurchaseRequestItem`
اقلام: نام مصالح (Master یا آزاد)، مقدار، واحد، توضیح. **هیچ فیلد قیمتی/مالی در مدل و هیچ‌جای ماژول وجود ندارد** (تست خودکار این را گارد می‌کند).

### گردش کار
```
انباردار (purchase.create): اعلام نیاز → PENDING + اعلان به مدیران
مدیر (purchase.approve): تأیید → APPROVED  |  رد با علت → REJECTED
مدیر (purchase.order): «خریداری شد» → ORDERED + اعلان به انباردار
انباردار (purchase.receive): «دریافت در انبار» → RECEIVED (بستن حلقهٔ کنترل)
```
ویرایش/حذف فقط در وضعیت PENDING و فقط توسط ثبت‌کننده.

## ۳) گزارش کار کارگران (Work Report)

### مدل داده — `WorkReport`
`workerName` (snapshot یا نام آزاد) + `workerId` اختیاری از Master Data، `reportDate` (نیمه‌شب تهران→UTC)، `content` (شرح کار)، `crewCount` (نفرات گروه)، پروژه/کارگاه.

### قواعد
- ثبت: مجوز `workreport.create` (سرپرست، مدیر کارگاه، ادمین) — بدون گردش تأیید؛ «اعلام گزارش توسط خودش»
- حذف: ثبت‌کننده یا `workreport.delete` (مدیر کارگاه/ادمین)
- فهرست: Scope کارگاه/پروژه + فیلتر بازهٔ تاریخ جلالی + جستجو در نام و شرح

## ۴) حذف کامل تبدیل ویس به نوشتار

### حذف‌شده‌ها
- صفحات: `voice-entry.tsx`، `voice-preview.tsx` (ثبت صوتی ورود مصالح)
- API: `/api/v1/voice/transcribe`، `/api/v1/voice/extract`، `/api/v1/daily-tasks/extract-items`
- کتابخانه: `src/lib/stt.ts` (ز-ای ASR + external) و تمام ENVهای `STT_*`
- مدل `VoiceTranscript` + فیلدهای `transcript/transcribeStatus/transcribeError/transcribedAt` در `DailyAudio`، `sourceType/sourceAudioId/sourceTranscript` در `DailyTask`، `transcript` در `DailyReport`/`TaskComment`
- مجوز `voice.transcribe`؛ پاک‌سازی رکوردهای قدیمی در Seed
- وابستگی `z-ai-web-dev-sdk` از package.json حذف شد — **صفر وابستگی هوش مصنوعی/خارجی**

### نگه‌داشته‌شده‌ها
- «پیام صوتی» ساده (ضبط/انتخاب فایل → ذخیرهٔ امن → پخش با Signed URL) برای گزارش روزانه و دیدگاه وظیفه — بدون هیچ تبدیل به متن

## ۵) نقش جدید GENERAL_MANAGER (مدیر کل)

- Seed: `gm.sa` / 123456 — دید سراسری (مانند ADMIN) اما فقط دسترسی‌های مشاهده + `statement.gmSign`
- ناوبری: مانند مدیران (داشبورد، تأییدها، روزانه، ثبت‌ها، اعلان‌ها، بیشتر)
- کارت‌های داشبورد: صورت وضعیت‌ها / درخواست‌های خرید / گزارش کار

## ۶) Migration

`prisma/migrations/3_simplify_voice_and_modules` — تولید با `prisma migrate diff` و `migrate resolve --applied` روی دیتابیس توسعه. اسکیمای PostgreSQL با `npm run db:pg-schema` بازتولید شد.

## ۷) تست‌ها — `scripts/modules-tests.mjs` (۶۳ تست)

- RBAC: بیننده/سرپرست/انباردار/مدیر/مدیر کل — هر عملیات فقط با مجوز درست
- Scope/IDOR: سرپرست کارگاه B هیچ رکوردی از کارگاه A نمی‌بیند/حذف نمی‌کند
- آستانهٔ امضا: ۱۲۰م→تأیید مستقیم؛ ۱۸۰م→PENDING_GM_SIGN→امضا→SIGNED؛ امضای غیرمدیر کل→403؛ قالب خراب→422؛ امضای مجدد→423؛ Signed URL منقضی/جعلی→404
- خرید: گردش کامل، منع فیلد مالی، استفادهٔ مجدد صوت/درخواست
- حذف Voice: مسیرهای حذف‌شده 404/405 + Strip فیلدهای منسوخ

**مجموع کل سوئیت‌ها: ۲۶۰/۲۶۰ سبز** (۶۳ ماژول‌ها + ۳۸ امنیتی + ۷۱ روزانه + ۵۶ Enterprise + ۲۷ Production + ۵ تاریخ)

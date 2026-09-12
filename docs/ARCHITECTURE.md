# سامانه هوشمند ثبت ورود مصالح کارگاه — معماری (Phase 0)

> Secure Construction Material Intake Platform — Modular Monolith / Mobile-First PWA / فارسی RTL

## 1. اصول معماری

- **Modular Monolith**: ماژول‌های Auth / MasterData / Entries / Workflow / Voice / Files / Reports / Audit
- **هرگز AI مستقیم به DB نمی‌نویسد**: Extraction → Draft → Validation → Preview → تأیید انسانی → تراکنش
- **Security در Backend**: تمام Queryها Scope-Filtered هستند؛ Frontend Filter امنیت نیست
- **Server Timestamp ملاک قانون 24 ساعت** است، نه ساعت موبایل
- **No Hard Delete** برای داده‌های مهم؛ Versioning + Audit Log

## 2. State Machine وضعیت ثبت

```
DRAFT ──submit──▶ SUBMITTED ──(مشاهده مدیر)──▶ PENDING_REVIEW
                                                     │
                     ┌───────────────┬───────────────┴─────────────┐
                     ▼               ▼                             ▼
                 APPROVED         REJECTED              CORRECTION_REQUESTED
                     │                                             │
              now-submittedAt>24h → LOCKED            (ویرایش + resubmit)
                     │                                             ▼
                     └────────────────────────────── RESUBMITTED ─▶ PENDING_REVIEW
```

- قوانین انتقال در `src/lib/entry-rules.ts` — تک منبع حقیقت
- ویرایش مستقیم: فقط در وضعیت‌های DRAFT/SUBMITTED/PENDING_REVIEW/APPROVED/CORRECTION_REQUESTED و فقط اگر `serverNow - submittedAt < 24h`
- ویرایش APPROVED = نسخه جدید (Version Bump) + Audit

## 3. Permission Matrix

| Permission | SUPER_ADMIN | ADMIN | PROJECT_MANAGER | WORKSHOP_MANAGER | WORKSHOP_SUPERVISOR |
|---|---|---|---|---|---|
| entry.create | ✅ | ✅ | ❌ | ✅ | ✅ |
| entry.edit | ✅ | ✅ | ❌ | ✅ | ✅ |
| entry.submit | ✅ | ✅ | ❌ | ✅ | ✅ |
| entry.review | ✅ | ✅ | ✅ | ✅ | ❌ |
| entry.correction.request | ✅ | ✅ | ❌ | ✅ | ✅ |
| masterdata.manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| users.manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| workshops.manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| projects.manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| audit.view | ✅ | ✅ | ✅(scoped) | ✅(scoped) | ✅(خودش) |
| reports.view | ✅ | ✅ | ✅(scoped) | ✅(scoped) | ✅(scoped) |
| admin.panel | ✅ | ✅ | ❌ | ❌ | ❌ |

## 4. Data Scope Chain

```
Request → Session → User → Role → Permissions → Workshop Access → Project Access → Query Filter
```

- WORKSHOP_SUPERVISOR / WORKSHOP_MANAGER: فقط `workshopId` خودش
- PROJECT_MANAGER: فقط پروژه‌های UserProject
- هر `GET /material-entries/:id` خارج از Scope → **404**
- تست اجباری: Supervisor A هرگز Entry/Project/Workshop/Supplier/Invoice/Worker مربوط به B را نمی‌بیند (حتی با ID دستکاری‌شده)

## 5. ERD (SQLite / Prisma)

```
User ─1:n─ Session
User ─m:n─ Workshop (UserWorkshop)      User ─m:n─ Project (UserProject)
Workshop ─1:n─ Project
Workshop ─1:n─ Supplier | Material | Worker
MaterialUnit (global lookup)
MaterialEntry ─1:n─ MaterialEntryItem
MaterialEntry ─m:n─ Project (MaterialEntryProject)
MaterialEntry ─1:n─ MaterialEntryWorker → Worker?
MaterialEntry ─1:n─ Attachment
MaterialEntry ─1:n─ VoiceTranscript
MaterialEntry ─1:n─ MaterialEntryVersion (snapshot JSON، هرگز حذف نمی‌شود)
MaterialEntry ─1:n─ Approval
MaterialEntry ─1:n─ CorrectionRequest
User/Action ─▶ AuditLog (User, Action, Entity, Old/New, IP, Device, Reason)
User ─1:n─ Notification
Role ─m:n─ Permission (RolePermission) — seed اولیه، قابل توسعه
```

## 6. API Contract (v1)

همه پاسخ‌ها: `{ success, data? , code?, message? }` — خطا: کد ماشین‌خوان + پیام فارسی انسانی

| Endpoint | Methods | Permission |
|---|---|---|
| /api/v1/auth/login | POST | عمومی (Rate Limit 5/min) |
| /api/v1/auth/logout | POST | Session |
| /api/v1/auth/me | GET | Session |
| /api/v1/master | GET | Session (scope-aware) |
| /api/v1/material-entries | GET, POST | entry.create |
| /api/v1/material-entries/:id | GET, PATCH | entry.edit + Scope(404) |
| /api/v1/material-entries/:id/submit | POST | entry.submit |
| /api/v1/material-entries/:id/review | POST | entry.review (action: APPROVE/REJECT/REQUEST_CORRECTION) |
| /api/v1/material-entries/:id/resubmit | POST | entry.submit |
| /api/v1/material-entries/:id/correction-request | POST | entry.correction.request |
| /api/v1/material-entries/:id/versions | GET | Scope |
| /api/v1/attachments | POST (multipart) | entry.edit |
| /api/v1/attachments/:id | GET, DELETE | Scope |
| /api/v1/attachments/:id/file | GET | Signed URL یا Session + Scope |
| /api/v1/voice/transcribe | POST (audio) | entry.create |
| /api/v1/voice/extract | POST | entry.create |
| /api/v1/notifications | GET, POST(read) | Session |
| /api/v1/audit-logs | GET | audit.view (scope-aware) |
| /api/v1/reports/summary | GET | reports.view (scope-aware) |
| /api/v1/dashboard | GET | Session (role-aware) |
| /api/v1/admin/users | GET, POST, PATCH | users.manage |
| /api/v1/admin/workshops | GET, POST, PATCH | workshops.manage |
| /api/v1/admin/projects | GET, POST, PATCH | projects.manage |
| /api/v1/admin/{materials,suppliers,workers,units} | GET, POST, PATCH | masterdata.manage |
| /api/v1/admin/roles | GET | admin.panel |

## 7. امنیت

- scrypt + salt برای هش پسورد، مقایسه timing-safe
- Session: توکن 32 بایتی random، کوکی httpOnly SameSite=Lax، انقضا 30 روز
- CSRF: بررسی Origin/Referer + هدر سفارشی روی متدهای تغییردهنده
- Rate Limit: in-memory (login 5/min، writes 60/min)
- IDOR: فیلتر Scope داخل خود Query — نه بعد از واکشی
- فایل‌ها: خارج از public + Signed URL (HMAC، انقضا 10 دقیقه) + چک Scope + MIME/Extension/Size سمت سرور
- Secure Headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy در middleware

## 8. Voice Pipeline

```
Microphone (MediaRecorder/webm) → POST /voice/transcribe → z-ai ASR → Transcript
→ POST /voice/extract → LLM (پرامپت فارسی سخت‌گیرانه + لیست واقعی موجودیت‌ها)
→ Structured Draft + confidence + missing[] + ambiguities[]
→ Progressive Clarification (فقط فیلدهای گمشده)
→ Preview قابل ویرایش → تأیید انسانی → POST /material-entries (همان API ثبت دستی)
```

- Transcript + Extracted JSON در VoiceTranscript ثبت می‌شود (Audit) ولی Entry نمی‌سازد
- Confidence < 0.6 → هشدار UI
- خطای STT → امکان ویرایش متن و تلاش مجدد

## 9. Design System — Modern Industrial SaaS

- فونت: Vazirmatn (self-host) · dir=rtl · اعداد فارسی · تقویم جلالی
- رنگ‌ها: پس‌زمینه zinc-50، سطح سفید، متن zinc-900، Accent کهربایی صنعتی (amber-600)، Primary تیره zinc-900
- وضعیت‌ها: APPROVED سبز 600 / PENDING زرد 500 / REJECTED قرمز 600 / SUBMITTED آبی 600 / CORRECTION نارنجی 600 / LOCKED خنثی zinc
- مؤلفه‌ها: Button, Input, Select, Card, BottomSheet(vaul), Dialog, Toast(sonner), Badge, Skeleton, EmptyState, ErrorState
- قواعد: Touch Target ≥44px، فرم‌های کوتاه، Bottom Sheet برای انتخاب، Keyboard نوع‌دار، بدون Glassmorphism/گرادیان اضافه

## 10. ساختار پوشه

```
prisma/schema.prisma        # 24 موجودیت + indexها
db/                         # فایل SQLite
uploads/                    # فایل‌های خصوصی (خارج از public)
docs/ARCHITECTURE.md        # همین سند
src/lib/                    # auth, permissions, scope, audit, ratelimit, signed-url,
                            # entry-rules, workflow, voice-extract, jalali, fa, api
src/app/api/v1/...          # Route Handlers
src/app/page.tsx            # نقطه ورود SPA (تنها route قابل مشاهده)
src/components/app/         # screens/, shared/, sheets/
src/store/app.ts            # Zustand: session, navigation stack, toasts
public/manifest.webmanifest # PWA
```

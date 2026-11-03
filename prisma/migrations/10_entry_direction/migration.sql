-- جهت ثبت: IN (ورود مصالح) | OUT (خروج مصالح) — یک جریان واحد برای ورود و خروج
-- دو migration قبل فقط روی نسخهٔ SQLite نوشته شده‌اند؛ این عبارت در Postgres نیز یکسان کار می‌کند.

ALTER TABLE "MaterialEntry" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'IN';

CREATE INDEX "MaterialEntry_direction_status_idx" ON "MaterialEntry"("direction", "status");

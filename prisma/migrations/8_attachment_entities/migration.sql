-- تعمیم سیستم پیوست: پشتیبانی از صورت وضعیت و گزارش کار در کنار ثبت ورود
ALTER TABLE "Attachment" ADD COLUMN "entityType" TEXT NOT NULL DEFAULT 'ENTRY';
ALTER TABLE "Attachment" ADD COLUMN "entityId" TEXT;
UPDATE "Attachment" SET "entityId" = "entryId" WHERE "entityId" IS NULL AND "entryId" IS NOT NULL;
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

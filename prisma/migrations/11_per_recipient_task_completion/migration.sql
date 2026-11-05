-- Item 8 — تکمیل مستقل هر گیرنده (Per-recipient task completion)
-- کاملاً افزودنی (additive): هیچ ستون/جدول موجود حذف یا تغییر نوع نمی‌شود.
-- جدول جدید TaskItemCompletion + دو ستون nullable روی TaskAssignee.

-- CreateTable
CREATE TABLE "TaskItemCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "completionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskItemCompletion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DailyTaskItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskItemCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AddColumn (nullable — سازگار با رکوردهای موجود)
ALTER TABLE "TaskAssignee" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "TaskAssignee" ADD COLUMN "completionNote" TEXT;

-- Backfill (امنیتی — اولین تیک مشترک را به انجام مستقل گیرنده‌ها تبدیل می‌کند):
-- هر گیرنده‌ای که آیتمی به‌اشتراک تیک خورده، انجام همان آیتم برای او ثبت می‌شود.
INSERT INTO "TaskItemCompletion" ("id", "itemId", "userId", "isCompleted", "completedAt", "completionNote", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(16))),
    "DailyTaskItem"."id",
    "TaskAssignee"."userId",
    true,
    "DailyTaskItem"."completedAt",
    "DailyTaskItem"."completionNote",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "DailyTaskItem"
JOIN "DailyTask" ON "DailyTask"."id" = "DailyTaskItem"."taskId"
JOIN "TaskAssignee" ON "TaskAssignee"."taskId" = "DailyTask"."id"
WHERE "DailyTaskItem"."isCompleted" = true
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE INDEX "TaskItemCompletion_userId_idx" ON "TaskItemCompletion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskItemCompletion_itemId_userId_key" ON "TaskItemCompletion"("itemId", "userId");

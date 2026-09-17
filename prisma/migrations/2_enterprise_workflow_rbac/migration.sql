-- AlterTable
ALTER TABLE "DailyReport" ADD COLUMN "clientRequestId" TEXT;

-- AlterTable
ALTER TABLE "MaterialEntry" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "MaterialEntry" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "MaterialEntry" ADD COLUMN "closedById" TEXT;
ALTER TABLE "MaterialEntry" ADD COLUMN "deliveredAt" DATETIME;
ALTER TABLE "MaterialEntry" ADD COLUMN "deliveredById" TEXT;
ALTER TABLE "MaterialEntry" ADD COLUMN "techReviewNote" TEXT;
ALTER TABLE "MaterialEntry" ADD COLUMN "techReviewStartedAt" DATETIME;
ALTER TABLE "MaterialEntry" ADD COLUMN "techReviewedAt" DATETIME;
ALTER TABLE "MaterialEntry" ADD COLUMN "techReviewedById" TEXT;
ALTER TABLE "MaterialEntry" ADD COLUMN "warehouseConfirmedAt" DATETIME;
ALTER TABLE "MaterialEntry" ADD COLUMN "warehouseConfirmedById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT;

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntryStageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntryStageLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntryStageLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskItemPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskItemPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DailyTaskItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskItemPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacedById" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attachment_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("createdAt", "entryId", "fileName", "id", "kind", "mimeType", "size", "storagePath", "uploadedById") SELECT "createdAt", "entryId", "fileName", "id", "kind", "mimeType", "size", "storagePath", "uploadedById" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE UNIQUE INDEX "Attachment_replacedById_key" ON "Attachment"("replacedById");
CREATE INDEX "Attachment_entryId_idx" ON "Attachment"("entryId");
CREATE INDEX "Attachment_entryId_version_idx" ON "Attachment"("entryId", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_createdAt_idx" ON "NotificationDelivery"("channel", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EntryStageLog_entryId_createdAt_idx" ON "EntryStageLog"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "EntryStageLog_actorId_idx" ON "EntryStageLog"("actorId");

-- CreateIndex
CREATE INDEX "TaskItemPhoto_itemId_idx" ON "TaskItemPhoto"("itemId");

-- CreateIndex
CREATE INDEX "TaskItemPhoto_uploadedById_idx" ON "TaskItemPhoto"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_clientRequestId_key" ON "DailyReport"("clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialEntry_clientRequestId_key" ON "MaterialEntry"("clientRequestId");

-- CreateIndex
CREATE INDEX "MaterialEntry_status_closedAt_idx" ON "MaterialEntry"("status", "closedAt");

-- CreateIndex
CREATE INDEX "MaterialEntry_clientRequestId_idx" ON "MaterialEntry"("clientRequestId");

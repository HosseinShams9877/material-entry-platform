-- DropIndex
DROP INDEX "DailyAudio_kind_createdAt_idx";

-- DropIndex
DROP INDEX "DailyAudio_uploadedById_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DailyAudio";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "clientRequestId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyReport_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DailyReport" ("clientRequestId", "content", "createdAt", "id", "projectId", "reportDate", "reporterId", "reviewNote", "reviewedAt", "reviewedById", "sourceType", "status", "submittedAt", "title", "updatedAt", "workshopId") SELECT "clientRequestId", "content", "createdAt", "id", "projectId", "reportDate", "reporterId", "reviewNote", "reviewedAt", "reviewedById", "sourceType", "status", "submittedAt", "title", "updatedAt", "workshopId" FROM "DailyReport";
DROP TABLE "DailyReport";
ALTER TABLE "new_DailyReport" RENAME TO "DailyReport";
CREATE UNIQUE INDEX "DailyReport_clientRequestId_key" ON "DailyReport"("clientRequestId");
CREATE INDEX "DailyReport_projectId_idx" ON "DailyReport"("projectId");
CREATE INDEX "DailyReport_workshopId_status_idx" ON "DailyReport"("workshopId", "status");
CREATE INDEX "DailyReport_reporterId_createdAt_idx" ON "DailyReport"("reporterId", "createdAt");
CREATE INDEX "DailyReport_reportDate_idx" ON "DailyReport"("reportDate");
CREATE INDEX "DailyReport_status_submittedAt_idx" ON "DailyReport"("status", "submittedAt");
CREATE INDEX "DailyReport_createdAt_idx" ON "DailyReport"("createdAt");
CREATE TABLE "new_TaskComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskComment" ("content", "createdAt", "id", "taskId", "userId") SELECT "content", "createdAt", "id", "taskId", "userId" FROM "TaskComment";
DROP TABLE "TaskComment";
ALTER TABLE "new_TaskComment" RENAME TO "TaskComment";
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


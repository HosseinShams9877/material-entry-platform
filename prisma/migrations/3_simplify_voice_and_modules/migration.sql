-- DropIndex
DROP INDEX "VoiceTranscript_createdById_idx";

-- DropIndex
DROP INDEX "VoiceTranscript_entryId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "VoiceTranscript";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ProgressStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "projectId" TEXT,
    "periodText" TEXT,
    "amount" BIGINT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "needsGmSign" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "submittedAt" DATETIME,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "approvalNote" TEXT,
    "signedById" TEXT,
    "signedAt" DATETIME,
    "signerName" TEXT,
    "signaturePath" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" DATETIME,
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProgressStatement_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProgressStatement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProgressStatement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProgressStatement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProgressStatement_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProgressStatement_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "workshopId" TEXT NOT NULL,
    "projectId" TEXT,
    "requestedById" TEXT NOT NULL,
    "neededBy" DATETIME,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "orderedById" TEXT,
    "orderedAt" DATETIME,
    "receivedById" TEXT,
    "receivedAt" DATETIME,
    "rejectedById" TEXT,
    "rejectedAt" DATETIME,
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseRequest_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseRequestItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "materialId" TEXT,
    "materialName" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PurchaseRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "projectId" TEXT,
    "workerId" TEXT,
    "workerName" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "content" TEXT NOT NULL,
    "crewCount" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkReport_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkReport_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyAudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyAudio_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyAudio" ("createdAt", "fileName", "id", "kind", "mimeType", "size", "storagePath", "uploadedById") SELECT "createdAt", "fileName", "id", "kind", "mimeType", "size", "storagePath", "uploadedById" FROM "DailyAudio";
DROP TABLE "DailyAudio";
ALTER TABLE "new_DailyAudio" RENAME TO "DailyAudio";
CREATE INDEX "DailyAudio_uploadedById_idx" ON "DailyAudio"("uploadedById");
CREATE INDEX "DailyAudio_kind_createdAt_idx" ON "DailyAudio"("kind", "createdAt");
CREATE TABLE "new_DailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "audioId" TEXT,
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
    CONSTRAINT "DailyReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyReport_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "DailyAudio" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DailyReport" ("audioId", "clientRequestId", "content", "createdAt", "id", "projectId", "reportDate", "reporterId", "reviewNote", "reviewedAt", "reviewedById", "sourceType", "status", "submittedAt", "title", "updatedAt", "workshopId") SELECT "audioId", "clientRequestId", "content", "createdAt", "id", "projectId", "reportDate", "reporterId", "reviewNote", "reviewedAt", "reviewedById", "sourceType", "status", "submittedAt", "title", "updatedAt", "workshopId" FROM "DailyReport";
DROP TABLE "DailyReport";
ALTER TABLE "new_DailyReport" RENAME TO "DailyReport";
CREATE UNIQUE INDEX "DailyReport_audioId_key" ON "DailyReport"("audioId");
CREATE UNIQUE INDEX "DailyReport_clientRequestId_key" ON "DailyReport"("clientRequestId");
CREATE INDEX "DailyReport_projectId_idx" ON "DailyReport"("projectId");
CREATE INDEX "DailyReport_workshopId_status_idx" ON "DailyReport"("workshopId", "status");
CREATE INDEX "DailyReport_reporterId_createdAt_idx" ON "DailyReport"("reporterId", "createdAt");
CREATE INDEX "DailyReport_reportDate_idx" ON "DailyReport"("reportDate");
CREATE INDEX "DailyReport_status_submittedAt_idx" ON "DailyReport"("status", "submittedAt");
CREATE INDEX "DailyReport_createdAt_idx" ON "DailyReport"("createdAt");
CREATE TABLE "new_DailyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "assignedDate" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "sentAt" DATETIME,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "completionNote" TEXT,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DailyTask" ("assignedDate", "cancelReason", "completedAt", "completedById", "completionNote", "createdAt", "createdById", "description", "dueDate", "id", "priority", "projectId", "sentAt", "status", "title", "updatedAt", "workshopId") SELECT "assignedDate", "cancelReason", "completedAt", "completedById", "completionNote", "createdAt", "createdById", "description", "dueDate", "id", "priority", "projectId", "sentAt", "status", "title", "updatedAt", "workshopId" FROM "DailyTask";
DROP TABLE "DailyTask";
ALTER TABLE "new_DailyTask" RENAME TO "DailyTask";
CREATE INDEX "DailyTask_projectId_idx" ON "DailyTask"("projectId");
CREATE INDEX "DailyTask_workshopId_status_idx" ON "DailyTask"("workshopId", "status");
CREATE INDEX "DailyTask_assignedDate_idx" ON "DailyTask"("assignedDate");
CREATE INDEX "DailyTask_status_dueDate_idx" ON "DailyTask"("status", "dueDate");
CREATE INDEX "DailyTask_createdById_createdAt_idx" ON "DailyTask"("createdById", "createdAt");
CREATE INDEX "DailyTask_createdAt_idx" ON "DailyTask"("createdAt");
CREATE TABLE "new_TaskComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "audioId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskComment_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "DailyAudio" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TaskComment" ("audioId", "content", "createdAt", "id", "taskId", "userId") SELECT "audioId", "content", "createdAt", "id", "taskId", "userId" FROM "TaskComment";
DROP TABLE "TaskComment";
ALTER TABLE "new_TaskComment" RENAME TO "TaskComment";
CREATE UNIQUE INDEX "TaskComment_audioId_key" ON "TaskComment"("audioId");
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProgressStatement_number_key" ON "ProgressStatement"("number");

-- CreateIndex
CREATE INDEX "ProgressStatement_workshopId_status_idx" ON "ProgressStatement"("workshopId", "status");

-- CreateIndex
CREATE INDEX "ProgressStatement_projectId_idx" ON "ProgressStatement"("projectId");

-- CreateIndex
CREATE INDEX "ProgressStatement_status_submittedAt_idx" ON "ProgressStatement"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ProgressStatement_createdById_createdAt_idx" ON "ProgressStatement"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressStatement_number_idx" ON "ProgressStatement"("number");

-- CreateIndex
CREATE INDEX "ProgressStatement_createdAt_idx" ON "ProgressStatement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_number_key" ON "PurchaseRequest"("number");

-- CreateIndex
CREATE INDEX "PurchaseRequest_workshopId_status_idx" ON "PurchaseRequest"("workshopId", "status");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_createdAt_idx" ON "PurchaseRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requestedById_createdAt_idx" ON "PurchaseRequest"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseRequest_projectId_idx" ON "PurchaseRequest"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_number_idx" ON "PurchaseRequest"("number");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_requestId_idx" ON "PurchaseRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_materialId_idx" ON "PurchaseRequestItem"("materialId");

-- CreateIndex
CREATE INDEX "WorkReport_workshopId_reportDate_idx" ON "WorkReport"("workshopId", "reportDate");

-- CreateIndex
CREATE INDEX "WorkReport_reportDate_idx" ON "WorkReport"("reportDate");

-- CreateIndex
CREATE INDEX "WorkReport_workerId_idx" ON "WorkReport"("workerId");

-- CreateIndex
CREATE INDEX "WorkReport_projectId_idx" ON "WorkReport"("projectId");

-- CreateIndex
CREATE INDEX "WorkReport_createdById_createdAt_idx" ON "WorkReport"("createdById", "createdAt");


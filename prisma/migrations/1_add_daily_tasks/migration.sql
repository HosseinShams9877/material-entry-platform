-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceAudioId" TEXT,
    "sourceTranscript" TEXT,
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
    CONSTRAINT "DailyTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_sourceAudioId_fkey" FOREIGN KEY ("sourceAudioId") REFERENCES "DailyAudio" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" DATETIME,
    CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyTaskItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "completionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyTaskItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyTaskItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "audioId" TEXT,
    "transcript" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
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

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "audioId" TEXT,
    "transcript" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskComment_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "DailyAudio" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyAudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "transcript" TEXT,
    "transcribeStatus" TEXT NOT NULL DEFAULT 'NONE',
    "transcribeError" TEXT,
    "transcribedAt" DATETIME,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyAudio_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailyTask_projectId_idx" ON "DailyTask"("projectId");

-- CreateIndex
CREATE INDEX "DailyTask_workshopId_status_idx" ON "DailyTask"("workshopId", "status");

-- CreateIndex
CREATE INDEX "DailyTask_assignedDate_idx" ON "DailyTask"("assignedDate");

-- CreateIndex
CREATE INDEX "DailyTask_status_dueDate_idx" ON "DailyTask"("status", "dueDate");

-- CreateIndex
CREATE INDEX "DailyTask_createdById_createdAt_idx" ON "DailyTask"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "DailyTask_createdAt_idx" ON "DailyTask"("createdAt");

-- CreateIndex
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_userId_key" ON "TaskAssignee"("taskId", "userId");

-- CreateIndex
CREATE INDEX "DailyTaskItem_taskId_sortOrder_idx" ON "DailyTaskItem"("taskId", "sortOrder");

-- CreateIndex
CREATE INDEX "DailyTaskItem_completedById_idx" ON "DailyTaskItem"("completedById");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_audioId_key" ON "DailyReport"("audioId");

-- CreateIndex
CREATE INDEX "DailyReport_projectId_idx" ON "DailyReport"("projectId");

-- CreateIndex
CREATE INDEX "DailyReport_workshopId_status_idx" ON "DailyReport"("workshopId", "status");

-- CreateIndex
CREATE INDEX "DailyReport_reporterId_createdAt_idx" ON "DailyReport"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyReport_reportDate_idx" ON "DailyReport"("reportDate");

-- CreateIndex
CREATE INDEX "DailyReport_status_submittedAt_idx" ON "DailyReport"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "DailyReport_createdAt_idx" ON "DailyReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskComment_audioId_key" ON "TaskComment"("audioId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyAudio_uploadedById_idx" ON "DailyAudio"("uploadedById");

-- CreateIndex
CREATE INDEX "DailyAudio_kind_createdAt_idx" ON "DailyAudio"("kind", "createdAt");


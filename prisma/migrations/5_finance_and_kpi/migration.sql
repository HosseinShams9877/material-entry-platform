-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN "dueDate" DATETIME;
ALTER TABLE "PurchaseRequest" ADD COLUMN "paymentTerms" TEXT;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN "jobTitle" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'TRANSFER',
    "referenceNo" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "settledAt" DATETIME,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Receivable_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Receivable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Receivable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "targetReports" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkerGoal_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkerGoal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Payment_purchaseId_idx" ON "Payment"("purchaseId");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "Receivable_workshopId_status_idx" ON "Receivable"("workshopId", "status");

-- CreateIndex
CREATE INDEX "Receivable_projectId_idx" ON "Receivable"("projectId");

-- CreateIndex
CREATE INDEX "WorkerGoal_period_idx" ON "WorkerGoal"("period");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerGoal_workerId_period_key" ON "WorkerGoal"("workerId", "period");

-- CreateIndex
CREATE INDEX "PurchaseRequest_dueDate_idx" ON "PurchaseRequest"("dueDate");


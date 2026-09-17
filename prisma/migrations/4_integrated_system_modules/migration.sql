-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN "expectedDeliveryAt" DATETIME;
ALTER TABLE "PurchaseRequest" ADD COLUMN "invoiceFileName" TEXT;
ALTER TABLE "PurchaseRequest" ADD COLUMN "invoiceMimeType" TEXT;
ALTER TABLE "PurchaseRequest" ADD COLUMN "invoicePath" TEXT;
ALTER TABLE "PurchaseRequest" ADD COLUMN "invoiceSize" INTEGER;
ALTER TABLE "PurchaseRequest" ADD COLUMN "orderNote" TEXT;
ALTER TABLE "PurchaseRequest" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "PurchaseRequest" ADD COLUMN "supplierName" TEXT;
ALTER TABLE "PurchaseRequest" ADD COLUMN "totalAmount" BIGINT;

-- CreateTable
CREATE TABLE "WorkerTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "fromWorkshopId" TEXT,
    "toWorkshopId" TEXT NOT NULL,
    "transferredAt" DATETIME NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerTransfer_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkerTransfer_fromWorkshopId_fkey" FOREIGN KEY ("fromWorkshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkerTransfer_toWorkshopId_fkey" FOREIGN KEY ("toWorkshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkerTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "materialId" TEXT,
    "materialName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "minQuantity" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryStock_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "stockId" TEXT,
    "materialId" TEXT,
    "materialName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "direction" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'ISSUE',
    "purchaseRequestId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "InventoryStock" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneById" TEXT,
    "doneAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectChecklistItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectChecklistItem_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WORKSHOP_SUPERVISOR',
    "phone" TEXT,
    "email" TEXT,
    "workshopId" TEXT,
    "workerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "fullName", "id", "isActive", "passwordHash", "phone", "role", "updatedAt", "username", "workshopId") SELECT "createdAt", "email", "fullName", "id", "isActive", "passwordHash", "phone", "role", "updatedAt", "username", "workshopId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_workshopId_idx" ON "User"("workshopId");
CREATE INDEX "User_workerId_idx" ON "User"("workerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WorkerTransfer_workerId_transferredAt_idx" ON "WorkerTransfer"("workerId", "transferredAt");

-- CreateIndex
CREATE INDEX "WorkerTransfer_toWorkshopId_idx" ON "WorkerTransfer"("toWorkshopId");

-- CreateIndex
CREATE INDEX "WorkerTransfer_fromWorkshopId_idx" ON "WorkerTransfer"("fromWorkshopId");

-- CreateIndex
CREATE INDEX "InventoryStock_workshopId_idx" ON "InventoryStock"("workshopId");

-- CreateIndex
CREATE INDEX "InventoryStock_materialId_idx" ON "InventoryStock"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStock_workshopId_materialName_unit_key" ON "InventoryStock"("workshopId", "materialName", "unit");

-- CreateIndex
CREATE INDEX "InventoryMovement_workshopId_createdAt_idx" ON "InventoryMovement"("workshopId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_stockId_idx" ON "InventoryMovement"("stockId");

-- CreateIndex
CREATE INDEX "InventoryMovement_purchaseRequestId_idx" ON "InventoryMovement"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "InventoryMovement_direction_reason_idx" ON "InventoryMovement"("direction", "reason");

-- CreateIndex
CREATE INDEX "ProjectChecklistItem_projectId_sortOrder_idx" ON "ProjectChecklistItem"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "PurchaseRequest_supplierId_idx" ON "PurchaseRequest"("supplierId");

-- AlterTable
ALTER TABLE "MaterialEntry" ADD COLUMN "inventoryAppliedAt" DATETIME;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN "invoiceProvider" TEXT;


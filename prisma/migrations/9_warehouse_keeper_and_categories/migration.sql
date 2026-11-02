-- نقش انباردار + دسته‌بندی مصالح + تأمین‌کننده چند-کارگاهی + گردش پروژه‌محور + اعلام کمبود/مغایرت
-- (برای SQLite — مطابق migration_lock)

-- ── دسته‌بندی مصالح ──
CREATE TABLE "MaterialCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "MaterialCategory_name_key" ON "MaterialCategory"("name");

-- دسته‌بندی مصالح
ALTER TABLE "Material" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "Material_categoryId_idx" ON "Material"("categoryId");

-- ── تأمین‌کننده چند-کارگاهی ──
CREATE TABLE "SupplierWorkshop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    CONSTRAINT "SupplierWorkshop_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierWorkshop_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupplierWorkshop_supplierId_workshopId_key" ON "SupplierWorkshop"("supplierId", "workshopId");
CREATE INDEX "SupplierWorkshop_workshopId_idx" ON "SupplierWorkshop"("workshopId");

-- ── گردش انبار پروژه‌محور ──
ALTER TABLE "InventoryMovement" ADD COLUMN "projectId" TEXT;
CREATE INDEX "InventoryMovement_projectId_idx" ON "InventoryMovement"("projectId");

-- ── اعلام کمبود/مغایرت انبار ──
CREATE TABLE "StockDiscrepancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "projectId" TEXT,
    "stockId" TEXT,
    "materialName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "systemQty" REAL,
    "actualQty" REAL,
    "kind" TEXT NOT NULL DEFAULT 'MISMATCH',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolveNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockDiscrepancy_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockDiscrepancy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockDiscrepancy_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "InventoryStock" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockDiscrepancy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockDiscrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "StockDiscrepancy_workshopId_status_idx" ON "StockDiscrepancy"("workshopId", "status");
CREATE INDEX "StockDiscrepancy_projectId_idx" ON "StockDiscrepancy"("projectId");
CREATE INDEX "StockDiscrepancy_createdById_idx" ON "StockDiscrepancy"("createdById");

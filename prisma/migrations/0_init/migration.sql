-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WORKSHOP_SUPERVISOR',
    "phone" TEXT,
    "workshopId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "workshopId" TEXT,
    "clientName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserWorkshop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    CONSTRAINT "UserWorkshop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserWorkshop_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "UserProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "workshopId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Supplier_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "defaultUnit" TEXT,
    "workshopId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Material_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LABORER',
    "phone" TEXT,
    "workshopId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Worker_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "workshopId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'OTHER',
    "sourceSupplierId" TEXT,
    "sourceWorkshopId" TEXT,
    "sourceDescription" TEXT,
    "notes" TEXT,
    "hasInvoice" BOOLEAN NOT NULL DEFAULT false,
    "deliveryAt" DATETIME,
    "submittedAt" DATETIME,
    "decidedAt" DATETIME,
    "approvedById" TEXT,
    "decisionNote" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "editDeadline" DATETIME,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaterialEntry_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaterialEntry_sourceWorkshopId_fkey" FOREIGN KEY ("sourceWorkshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaterialEntry_sourceSupplierId_fkey" FOREIGN KEY ("sourceSupplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaterialEntry_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialEntryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "materialId" TEXT,
    "materialName" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "batchNumber" TEXT,
    "serialNumber" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MaterialEntryItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialEntryProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "MaterialEntryProject_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialEntryProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialEntryWorker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "workerId" TEXT,
    "workerName" TEXT NOT NULL,
    "workerKind" TEXT NOT NULL DEFAULT 'LABORER',
    "role" TEXT,
    CONSTRAINT "MaterialEntryWorker_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialEntryWorker_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceTranscript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT,
    "transcript" TEXT NOT NULL,
    "extractedJson" TEXT,
    "confidence" REAL,
    "missingFields" TEXT,
    "engine" TEXT NOT NULL DEFAULT 'z-ai',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceTranscript_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "decidedById" TEXT NOT NULL,
    "reason" TEXT,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" DATETIME,
    CONSTRAINT "Approval_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Approval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorrectionRequest_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CorrectionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialEntryVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "changeReason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialEntryVersion_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MaterialEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialEntryVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityId" TEXT,
    "entityType" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_workshopId_idx" ON "User"("workshopId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_code_key" ON "Workshop"("code");

-- CreateIndex
CREATE INDEX "Workshop_isActive_idx" ON "Workshop"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_workshopId_idx" ON "Project"("workshopId");

-- CreateIndex
CREATE INDEX "Project_isActive_idx" ON "Project"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserWorkshop_userId_workshopId_key" ON "UserWorkshop"("userId", "workshopId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProject_userId_projectId_key" ON "UserProject"("userId", "projectId");

-- CreateIndex
CREATE INDEX "Supplier_workshopId_idx" ON "Supplier"("workshopId");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "Material_workshopId_idx" ON "Material"("workshopId");

-- CreateIndex
CREATE INDEX "Material_name_idx" ON "Material"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialUnit_title_key" ON "MaterialUnit"("title");

-- CreateIndex
CREATE INDEX "Worker_workshopId_idx" ON "Worker"("workshopId");

-- CreateIndex
CREATE INDEX "Worker_fullName_idx" ON "Worker"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialEntry_entryNumber_key" ON "MaterialEntry"("entryNumber");

-- CreateIndex
CREATE INDEX "MaterialEntry_workshopId_status_idx" ON "MaterialEntry"("workshopId", "status");

-- CreateIndex
CREATE INDEX "MaterialEntry_supervisorId_idx" ON "MaterialEntry"("supervisorId");

-- CreateIndex
CREATE INDEX "MaterialEntry_status_submittedAt_idx" ON "MaterialEntry"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "MaterialEntry_type_idx" ON "MaterialEntry"("type");

-- CreateIndex
CREATE INDEX "MaterialEntry_sourceSupplierId_idx" ON "MaterialEntry"("sourceSupplierId");

-- CreateIndex
CREATE INDEX "MaterialEntry_createdAt_idx" ON "MaterialEntry"("createdAt");

-- CreateIndex
CREATE INDEX "MaterialEntry_entryNumber_createdAt_idx" ON "MaterialEntry"("entryNumber", "createdAt");

-- CreateIndex
CREATE INDEX "MaterialEntryItem_entryId_idx" ON "MaterialEntryItem"("entryId");

-- CreateIndex
CREATE INDEX "MaterialEntryItem_materialId_idx" ON "MaterialEntryItem"("materialId");

-- CreateIndex
CREATE INDEX "MaterialEntryProject_projectId_idx" ON "MaterialEntryProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialEntryProject_entryId_projectId_key" ON "MaterialEntryProject"("entryId", "projectId");

-- CreateIndex
CREATE INDEX "MaterialEntryWorker_entryId_idx" ON "MaterialEntryWorker"("entryId");

-- CreateIndex
CREATE INDEX "MaterialEntryWorker_workerId_idx" ON "MaterialEntryWorker"("workerId");

-- CreateIndex
CREATE INDEX "Attachment_entryId_idx" ON "Attachment"("entryId");

-- CreateIndex
CREATE INDEX "VoiceTranscript_entryId_idx" ON "VoiceTranscript"("entryId");

-- CreateIndex
CREATE INDEX "VoiceTranscript_createdById_idx" ON "VoiceTranscript"("createdById");

-- CreateIndex
CREATE INDEX "Approval_entryId_idx" ON "Approval"("entryId");

-- CreateIndex
CREATE INDEX "Approval_decidedById_idx" ON "Approval"("decidedById");

-- CreateIndex
CREATE INDEX "CorrectionRequest_entryId_idx" ON "CorrectionRequest"("entryId");

-- CreateIndex
CREATE INDEX "CorrectionRequest_status_idx" ON "CorrectionRequest"("status");

-- CreateIndex
CREATE INDEX "MaterialEntryVersion_entryId_idx" ON "MaterialEntryVersion"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialEntryVersion_entryId_version_key" ON "MaterialEntryVersion"("entryId", "version");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");


-- AlterTable
ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "tenantId" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "actorId" TEXT,
    "actorUsername" TEXT,
    "bodyJson" TEXT,
    "success" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

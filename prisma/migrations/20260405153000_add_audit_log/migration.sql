CREATE TYPE "AuditAction" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'UPSERT',
  'CREATE_MANY',
  'UPDATE_MANY',
  'DELETE_MANY'
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "requestId" TEXT,
  "method" TEXT,
  "path" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "actorId" TEXT,
  "actorPerfil" TEXT,
  "actorEmail" TEXT,
  "model" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "entityId" TEXT,
  "oldData" JSONB,
  "newData" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_model_createdAt_idx" ON "AuditLog"("model", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

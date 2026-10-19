-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'OPERATOR', 'RESELLER', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RouterStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNREACHABLE', 'CONNECTING', 'ERROR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ConnectionMethod" AS ENUM ('ROUTEROS_API_SSL', 'ROUTEROS_API_PLAIN', 'REST_API_HTTPS', 'SSH_TUNNEL');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('GENERATED', 'AVAILABLE', 'SOLD', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'CONNECT', 'DISCONNECT', 'PROVISION_USER', 'REVOKE_USER', 'DISCONNECT_SESSION', 'GENERATE_BATCH', 'SELL_CARDS', 'ROUTER_BACKUP', 'CONFIG_CHANGE');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'WARNING');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SDG',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxRoutersLimit" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "apiPort" INTEGER NOT NULL DEFAULT 8729,
    "connectionMethod" "ConnectionMethod" NOT NULL DEFAULT 'ROUTEROS_API_SSL',
    "status" "RouterStatus" NOT NULL DEFAULT 'OFFLINE',
    "routerOsVersion" TEXT,
    "boardModel" TEXT,
    "serialNumber" TEXT,
    "cpuLoadPercentage" INTEGER,
    "freeMemoryBytes" BIGINT,
    "totalMemoryBytes" BIGINT,
    "uptimeSeconds" BIGINT,
    "lastSeenAt" TIMESTAMP(3),
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "backupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "router_credentials" (
    "id" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "encryptionTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "certificateAuth" BOOLEAN NOT NULL DEFAULT false,
    "encryptedPrivateKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "router_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "downloadSpeedLimit" TEXT NOT NULL,
    "uploadSpeedLimit" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "dataLimitBytes" BIGINT NOT NULL DEFAULT 0,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SDG',
    "simultaneousSessions" INTEGER NOT NULL DEFAULT 1,
    "hotspotProfileName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "prefix" TEXT,
    "userLength" INTEGER NOT NULL DEFAULT 6,
    "passwordLength" INTEGER NOT NULL DEFAULT 4,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "isExported" BOOLEAN NOT NULL DEFAULT false,
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "routerId" TEXT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'GENERATED',
    "price" DECIMAL(10,2) NOT NULL,
    "firstLoginAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "totalUsedSeconds" BIGINT NOT NULL DEFAULT 0,
    "totalBytesIn" BIGINT NOT NULL DEFAULT 0,
    "totalBytesOut" BIGINT NOT NULL DEFAULT 0,
    "boundMacAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "soldById" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "routerId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "changesBefore" JSONB,
    "changesAfter" JSONB,
    "metadata" JSONB,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_username_key" ON "users"("tenantId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "routers_tenantId_status_idx" ON "routers"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "routers_tenantId_name_key" ON "routers"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "router_credentials_routerId_key" ON "router_credentials"("routerId");

-- CreateIndex
CREATE INDEX "packages_tenantId_isActive_idx" ON "packages"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "packages_tenantId_code_key" ON "packages"("tenantId", "code");

-- CreateIndex
CREATE INDEX "card_batches_tenantId_packageId_idx" ON "card_batches"("tenantId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "card_batches_tenantId_batchNumber_key" ON "card_batches"("tenantId", "batchNumber");

-- CreateIndex
CREATE INDEX "cards_tenantId_status_idx" ON "cards"("tenantId", "status");

-- CreateIndex
CREATE INDEX "cards_tenantId_batchId_idx" ON "cards"("tenantId", "batchId");

-- CreateIndex
CREATE INDEX "cards_tenantId_routerId_idx" ON "cards"("tenantId", "routerId");

-- CreateIndex
CREATE INDEX "cards_tenantId_expiresAt_idx" ON "cards"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "cards_tenantId_username_key" ON "cards"("tenantId", "username");

-- CreateIndex
CREATE INDEX "sessions_tenantId_isActive_idx" ON "sessions"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "sessions_cardId_idx" ON "sessions"("cardId");

-- CreateIndex
CREATE INDEX "sessions_routerId_idx" ON "sessions"("routerId");

-- CreateIndex
CREATE INDEX "sales_tenantId_createdAt_idx" ON "sales"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_cardId_key" ON "sale_items"("cardId");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_action_idx" ON "audit_logs"("tenantId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entityType_entityId_idx" ON "audit_logs"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routers" ADD CONSTRAINT "routers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "router_credentials" ADD CONSTRAINT "router_credentials_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_batches" ADD CONSTRAINT "card_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_batches" ADD CONSTRAINT "card_batches_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_batches" ADD CONSTRAINT "card_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "card_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "LicenseCodeStatus" AS ENUM ('UNUSED', 'USED', 'REVOKED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "subscriptionEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "license_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "maxRoutersLimit" INTEGER NOT NULL,
    "status" "LicenseCodeStatus" NOT NULL DEFAULT 'UNUSED',
    "createdByUserId" TEXT NOT NULL,
    "usedByTenantId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "license_codes_code_key" ON "license_codes"("code");

-- CreateIndex
CREATE INDEX "license_codes_status_idx" ON "license_codes"("status");

-- CreateIndex
CREATE INDEX "license_codes_code_idx" ON "license_codes"("code");

-- CreateIndex
CREATE INDEX "license_codes_usedByTenantId_idx" ON "license_codes"("usedByTenantId");

-- AddForeignKey
ALTER TABLE "license_codes" ADD CONSTRAINT "license_codes_usedByTenantId_fkey" FOREIGN KEY ("usedByTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

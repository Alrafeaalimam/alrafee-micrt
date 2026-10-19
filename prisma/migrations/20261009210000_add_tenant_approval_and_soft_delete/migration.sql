-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "tenants" ADD COLUMN "previousSubscriptionStatus" "SubscriptionStatus";
ALTER TABLE "tenants" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tenants_approvalStatus_idx" ON "tenants"("approvalStatus");
CREATE INDEX "tenants_isDeleted_idx" ON "tenants"("isDeleted");

-- Update existing platform and default tenants to APPROVED
UPDATE "tenants" SET "approvalStatus" = 'APPROVED' WHERE "slug" IN ('soft-zone-platform', 'default') OR "subscriptionStatus" = 'ACTIVE';

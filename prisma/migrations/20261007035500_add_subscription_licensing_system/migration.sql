-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL';
ALTER TABLE "tenants" ADD COLUMN "trialEndsAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + '7 days'::interval);
ALTER TABLE "tenants" ADD COLUMN "planName" TEXT;

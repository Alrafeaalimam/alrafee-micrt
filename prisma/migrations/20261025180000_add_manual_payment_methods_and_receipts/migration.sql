-- AlterEnum
ALTER TYPE "ConnectionMethod" ADD VALUE IF NOT EXISTS 'REST_API_PLAIN';

-- CreateTable
CREATE TABLE IF NOT EXISTS "manual_payment_methods" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "beneficiaryName" TEXT,
    "instructions" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SDG',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payment_methods_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "subscription_requests"
    ADD COLUMN IF NOT EXISTS "paymentMethodId" TEXT,
    ADD COLUMN IF NOT EXISTS "senderName" TEXT,
    ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscription_requests_referenceNumber_idx" ON "subscription_requests"("referenceNumber");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_paymentMethodId_fkey'
    ) THEN
        ALTER TABLE "subscription_requests"
            ADD CONSTRAINT "subscription_requests_paymentMethodId_fkey"
            FOREIGN KEY ("paymentMethodId") REFERENCES "manual_payment_methods"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

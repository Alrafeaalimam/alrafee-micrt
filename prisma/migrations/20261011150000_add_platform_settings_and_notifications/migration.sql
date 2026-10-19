-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MANUAL', 'SYSTEM');

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supportEmail" TEXT NOT NULL,
    "whatsappNumbers" TEXT[] NOT NULL,
    "primaryColorHex" TEXT,
    "accentColorHex" TEXT,
    "appName" TEXT NOT NULL DEFAULT 'Jalsah',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_reads_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notification_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "notifications_tenantId_createdAt_idx" ON "notifications"("tenantId", "createdAt");
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_reads_notificationId_userId_key" ON "notification_reads"("notificationId", "userId");
CREATE INDEX "notification_reads_userId_readAt_idx" ON "notification_reads"("userId", "readAt");

-- Initial PlatformSettings Seed
INSERT INTO "platform_settings" ("id", "supportEmail", "whatsappNumbers", "primaryColorHex", "accentColorHex", "appName", "updatedAt")
VALUES ('default-platform-settings', 'jalsahnetwork@gmail.com', ARRAY['0115715672', '0115715651'], '#3B2FA0', '#F5C94B', 'Jalsah', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

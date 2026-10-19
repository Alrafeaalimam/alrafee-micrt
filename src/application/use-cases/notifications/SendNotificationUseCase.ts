// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/notifications/SendNotificationUseCase.ts
// Use Case: Send Manual Notification / Broadcast (Super Admin Only)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { PLATFORM_TENANT_SLUG } from '../../../infrastructure/database/seed.js';

export interface SendNotificationInput {
  adminUserId: string;
  title: string;
  body: string;
  tenantId?: string | null;
}

export interface SendNotificationOutput {
  id: string;
  title: string;
  body: string;
  type: string;
  tenantId: string | null;
  createdAt: Date;
  message: string;
}

export class SendNotificationUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: SendNotificationInput): Promise<SendNotificationOutput> {
    const trimmedTitle = input.title?.trim();
    const trimmedBody = input.body?.trim();

    if (!trimmedTitle) {
      throw new Error('عنوان الإشعار مطلوب');
    }

    if (!trimmedBody) {
      throw new Error('نص الإشعار مطلوب');
    }

    let targetTenantId: string | null = null;
    let targetTenantName = 'جميع الشركات (بث عام)';

    if (input.tenantId && input.tenantId.trim()) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: input.tenantId.trim() },
      });
      if (!tenant || tenant.isDeleted) {
        throw new Error('الشركة المحددة غير موجودة');
      }
      targetTenantId = tenant.id;
      targetTenantName = tenant.name;
    }

    const notification = await this.prisma.notification.create({
      data: {
        title: trimmedTitle,
        body: trimmedBody,
        type: 'MANUAL',
        tenantId: targetTenantId,
      },
    });

    // Audit Log
    if (this.auditLogger) {
      let auditTenantId: string | undefined = targetTenantId ?? undefined;
      if (!auditTenantId) {
        const adminUser = await this.prisma.user.findUnique({
          where: { id: input.adminUserId },
          select: { tenantId: true },
        });
        auditTenantId = adminUser?.tenantId;
      }
      if (!auditTenantId) {
        const platformTenant = await this.prisma.tenant.findUnique({
          where: { slug: PLATFORM_TENANT_SLUG },
          select: { id: true },
        });
        auditTenantId = platformTenant?.id;
      }

      if (auditTenantId) {
        await this.auditLogger.log(
          auditTenantId,
          input.adminUserId,
          'CREATE',
          'Notification',
          notification.id,
          `تم إرسال إشعار "${trimmedTitle}" إلى: ${targetTenantName}`,
          'SUCCESS'
        );
      }
    }

    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      tenantId: notification.tenantId,
      createdAt: notification.createdAt,
      message: 'تم إرسال الإشعار بنجاح',
    };
  }
}

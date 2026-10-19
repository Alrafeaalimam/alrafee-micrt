// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/SuspendTenantUseCase.ts
// Use Case: Suspend Tenant Subscription (Super Admin Only - Rule 30 No Physical Delete)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';

export interface SuspendTenantInput {
  tenantId: string;
  adminUserId: string;
}

export class SuspendTenantUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: SuspendTenantInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });

    if (!tenant || tenant.isDeleted) {
      throw new Error('الشركة أو الشبكة غير موجودة');
    }

    if (tenant.slug === 'soft-zone-platform') {
      throw new Error('لا يمكن إيقاف الحساب الأساسي للمنصة');
    }

    // Keep track of current status before suspending so reactivate can restore it
    const previousStatus = tenant.subscriptionStatus !== 'SUSPENDED'
      ? tenant.subscriptionStatus
      : (tenant.previousSubscriptionStatus ?? 'ACTIVE');

    const updated = await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: {
        subscriptionStatus: 'SUSPENDED',
        previousSubscriptionStatus: previousStatus,
      },
    });

    if (this.auditLogger) {
      await this.auditLogger.log(
        tenant.id,
        input.adminUserId,
        'UPDATE',
        'Tenant',
        tenant.id,
        `تم إيقاف اشتراك الشبكة "${tenant.name}" مؤقتاً بواسطة مدير المنصة`,
        'SUCCESS'
      );
    }

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      subscriptionStatus: updated.subscriptionStatus,
      message: 'تم إيقاف اشتراك الحساب بنجاح',
    };
  }
}

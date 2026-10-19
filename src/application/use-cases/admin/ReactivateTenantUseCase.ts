// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/ReactivateTenantUseCase.ts
// Use Case: Reactivate Tenant Subscription to Previous State (Super Admin Only)
// ============================================================================

import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';

export interface ReactivateTenantInput {
  tenantId: string;
  adminUserId: string;
}

export class ReactivateTenantUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: ReactivateTenantInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });

    if (!tenant || tenant.isDeleted) {
      throw new Error('الشركة أو الشبكة غير موجودة');
    }

    const now = new Date();
    let targetStatus = tenant.previousSubscriptionStatus ?? 'ACTIVE';

    // If restoring to TRIAL, check if trial period has already expired
    if (targetStatus === 'TRIAL' && tenant.trialEndsAt.getTime() <= now.getTime()) {
      targetStatus = 'EXPIRED';
    }

    // If restoring to ACTIVE, check if subscription has already expired
    if (
      targetStatus === 'ACTIVE' &&
      tenant.subscriptionEndsAt &&
      tenant.subscriptionEndsAt.getTime() <= now.getTime()
    ) {
      targetStatus = 'EXPIRED';
    }

    const updated = await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: {
        subscriptionStatus: targetStatus,
        previousSubscriptionStatus: null,
      },
    });

    if (this.auditLogger) {
      await this.auditLogger.log(
        tenant.id,
        input.adminUserId,
        'UPDATE',
        'Tenant',
        tenant.id,
        `تم إعادة تفعيل اشتراك الشبكة "${tenant.name}" إلى الحالة (${targetStatus}) بواسطة مدير المنصة`,
        'SUCCESS'
      );
    }

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      subscriptionStatus: updated.subscriptionStatus,
      message: `تم إعادة تفعيل الحساب بنجاح إلى حالة (${targetStatus})`,
    };
  }
}

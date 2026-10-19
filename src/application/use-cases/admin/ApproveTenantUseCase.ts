// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/ApproveTenantUseCase.ts
// Use Case: Approve Pending Tenant Registration (Super Admin Only)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';

export interface ApproveTenantInput {
  tenantId: string;
  adminUserId: string;
}

export class ApproveTenantUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: ApproveTenantInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });

    if (!tenant || tenant.isDeleted) {
      throw new Error('الشركة أو الشبكة غير موجودة');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: {
        approvalStatus: 'APPROVED',
        status: 'ACTIVE',
      },
    });

    if (this.auditLogger) {
      await this.auditLogger.log(
        tenant.id,
        input.adminUserId,
        'UPDATE',
        'Tenant',
        tenant.id,
        `تمت الموافقة على طلب تسجيل الشبكة "${tenant.name}" من قبل مدير المنصة`,
        'SUCCESS'
      );
    }

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      approvalStatus: updated.approvalStatus,
      subscriptionStatus: updated.subscriptionStatus,
      message: 'تمت الموافقة على طلب التسجيل بنجاح',
    };
  }
}

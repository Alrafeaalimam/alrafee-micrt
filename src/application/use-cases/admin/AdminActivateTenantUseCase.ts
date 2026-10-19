// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/AdminActivateTenantUseCase.ts
// Use Case: Direct License Activation by Super Admin (Rule 27 Commercial Licensing)
// ============================================================================

import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';

export interface AdminActivateTenantInput {
  tenantId: string;
  planName: string;
  durationDays: number;
  maxRoutersLimit: number;
  adminUserId: string;
}

export interface AdminActivateTenantOutput {
  success: boolean;
  tenantId: string;
  tenantName: string;
  planName: string;
  durationDays: number;
  maxRoutersLimit: number;
  subscriptionStatus: string;
  subscriptionEndsAt: Date;
  message: string;
}

export class AdminActivateTenantUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: AdminActivateTenantInput): Promise<AdminActivateTenantOutput> {
    const trimmedPlan = input.planName.trim();
    if (!trimmedPlan) {
      throw new Error('اسم الخطة مطلوب');
    }

    if (input.durationDays <= 0) {
      throw new Error('مدة الاشتراك يجب أن تكون يوماً واحداً على الأقل');
    }

    if (input.maxRoutersLimit <= 0) {
      throw new Error('حد الراوترات يجب أن يكون راوتراً واحداً على الأقل');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });

    if (!tenant || tenant.isDeleted) {
      throw new Error('الشركة أو الشبكة غير موجودة');
    }

    const now = new Date();
    let baseDate = now;

    // Extend from existing active subscription if still in the future
    if (
      tenant.subscriptionStatus === 'ACTIVE' &&
      tenant.subscriptionEndsAt &&
      tenant.subscriptionEndsAt.getTime() > now.getTime()
    ) {
      baseDate = tenant.subscriptionEndsAt;
    }

    const newSubscriptionEndsAt = new Date(
      baseDate.getTime() + input.durationDays * 24 * 60 * 60 * 1000
    );

    const updated = await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: {
        subscriptionStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
        status: 'ACTIVE',
        planName: trimmedPlan,
        maxRoutersLimit: input.maxRoutersLimit,
        subscriptionEndsAt: newSubscriptionEndsAt,
      },
    });

    if (this.auditLogger) {
      await this.auditLogger.log(
        tenant.id,
        input.adminUserId,
        'UPDATE',
        'Tenant',
        tenant.id,
        `تم تفعيل الترخيص المباشر للشبكة "${tenant.name}": باقة "${trimmedPlan}"، مدة ${input.durationDays} يوم، سقف ${input.maxRoutersLimit} راوتر. الصلاحية حتى ${newSubscriptionEndsAt.toISOString()}`,
        'SUCCESS'
      );
    }

    return {
      success: true,
      tenantId: updated.id,
      tenantName: updated.name,
      planName: trimmedPlan,
      durationDays: input.durationDays,
      maxRoutersLimit: updated.maxRoutersLimit,
      subscriptionStatus: updated.subscriptionStatus,
      subscriptionEndsAt: newSubscriptionEndsAt,
      message: `تم تفعيل اشتراك الشبكة "${updated.name}" بنجاح (${trimmedPlan} - ${input.durationDays} يوم).`,
    };
  }
}

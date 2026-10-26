// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/RedeemLicenseCodeUseCase.ts
// Use Case: Redeem License Code to Activate or Extend Subscription (Tenant Admin)
// ============================================================================

import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import {
  LicenseCodeNotFoundException,
  LicenseCodeAlreadyUsedException,
  LicenseCodeRevokedException,
} from '../../../domain/exceptions/LicenseExceptions.js';

export interface RedeemLicenseCodeInput {
  code: string;
  tenantId: string;
  userId: string;
}

export interface RedeemLicenseCodeOutput {
  success: boolean;
  code: string;
  planName: string;
  durationDays: number;
  maxRoutersLimit: number;
  subscriptionStatus: string;
  subscriptionEndsAt: Date;
  message: string;
}

export class RedeemLicenseCodeUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: RedeemLicenseCodeInput): Promise<RedeemLicenseCodeOutput> {
    const normalizedCode = input.code.trim().toUpperCase();

    const license = await this.prisma.licenseCode.findUnique({
      where: { code: normalizedCode },
    });

    if (!license) {
      throw new LicenseCodeNotFoundException('كود الترخيص غير موجود أو غير صالح');
    }

    if (license.status === 'USED') {
      throw new LicenseCodeAlreadyUsedException('كود الترخيص تم استخدامه مسبقاً');
    }

    if (license.status === 'REVOKED') {
      throw new LicenseCodeRevokedException('كود الترخيص ملغي ولا يمكن استخدامه');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });

    if (!tenant) {
      throw new Error('الشبكة المطلوبة غير موجودة');
    }

    const now = new Date();
    let baseDate = now;

    // Extend from existing subscription if active and unexpired
    if (
      tenant.subscriptionStatus === 'ACTIVE' &&
      tenant.subscriptionEndsAt &&
      tenant.subscriptionEndsAt.getTime() > now.getTime()
    ) {
      baseDate = tenant.subscriptionEndsAt;
    }

    const newSubscriptionEndsAt = new Date(
      baseDate.getTime() + license.durationDays * 24 * 60 * 60 * 1000
    );

    // Atomically update tenant and license code
    const [updatedTenant, updatedLicense] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: input.tenantId },
        data: {
          subscriptionStatus: 'ACTIVE',
          planName: license.planName,
          maxRoutersLimit: license.maxRoutersLimit,
          subscriptionEndsAt: newSubscriptionEndsAt,
        },
      }),
      this.prisma.licenseCode.update({
        where: { id: license.id },
        data: {
          status: 'USED',
          usedByTenantId: input.tenantId,
          usedAt: now,
        },
      }),
    ]);

    // Record Security / Operations Audit Log
    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.userId,
        'UPDATE',
        'Tenant',
        input.tenantId,
        `تم تفعيل كود الترخيص (${updatedLicense.code}) بنجاح: باقة ${updatedLicense.planName}، مدة ${updatedLicense.durationDays} يوم، سقف ${updatedLicense.maxRoutersLimit} راوتر. الصلاحية حتى ${newSubscriptionEndsAt.toISOString()}`,
        'SUCCESS'
      );
    }

    return {
      success: true,
      code: updatedLicense.code,
      planName: updatedLicense.planName,
      durationDays: updatedLicense.durationDays,
      maxRoutersLimit: updatedTenant.maxRoutersLimit,
      subscriptionStatus: updatedTenant.subscriptionStatus,
      subscriptionEndsAt: newSubscriptionEndsAt,
      message: `تم تفعيل الاشتراك بنجاح! الباقة: ${updatedLicense.planName} (${updatedLicense.durationDays} يوماً).`,
    };
  }
}

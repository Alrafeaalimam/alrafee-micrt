// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/settings/UpdatePlatformSettingsUseCase.ts
// Use Case: Update Platform Settings (Super Admin Only)
// ============================================================================

import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { PLATFORM_TENANT_SLUG } from '../../../infrastructure/database/seed.js';

export interface UpdatePlatformSettingsInput {
  adminUserId: string;
  data: {
    supportEmail?: string;
    whatsappNumbers?: string[];
    primaryColorHex?: string | null;
    accentColorHex?: string | null;
    appName?: string;
  };
}

export interface PlatformSettingsOutput {
  id: string;
  supportEmail: string;
  whatsappNumbers: string[];
  primaryColorHex: string | null;
  accentColorHex: string | null;
  appName: string;
  updatedAt: Date;
  message: string;
}

export class UpdatePlatformSettingsUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: UpdatePlatformSettingsInput): Promise<PlatformSettingsOutput> {
    const { adminUserId, data } = input;

    // 1. Validation
    if (data.supportEmail !== undefined) {
      const email = data.supportEmail.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        throw new Error('صيغة البريد الإلكتروني للدعم الفني غير صحيحة');
      }
    }

    if (data.whatsappNumbers !== undefined) {
      if (!Array.isArray(data.whatsappNumbers) || data.whatsappNumbers.length === 0) {
        throw new Error('يجب توفير رقم واتساب واحد على الأقل للدعم الفني');
      }
      for (const num of data.whatsappNumbers) {
        if (typeof num !== 'string' || !num.trim()) {
          throw new Error('أرقام الواتساب يجب أن تكون نصوصاً غير فارغة');
        }
      }
    }

    if (data.appName !== undefined) {
      if (typeof data.appName !== 'string' || !data.appName.trim()) {
        throw new Error('اسم التطبيق لا يمكن أن يكون فارغاً');
      }
    }

    // 2. Fetch existing settings (or create initial)
    let currentSettings = await this.prisma.platformSettings.findFirst();
    if (!currentSettings) {
      currentSettings = await this.prisma.platformSettings.create({
        data: {
          id: 'default-platform-settings',
          supportEmail: 'jalsahnetwork@gmail.com',
          whatsappNumbers: ['0115715672', '0115715651'],
          primaryColorHex: '#3B2FA0',
          accentColorHex: '#F5C94B',
          appName: 'Jalsah',
        },
      });
    }

    // 3. Partial Update
    const updateData: Record<string, any> = {};
    if (data.supportEmail !== undefined) updateData['supportEmail'] = data.supportEmail.trim();
    if (data.whatsappNumbers !== undefined) {
      updateData['whatsappNumbers'] = data.whatsappNumbers.map((n) => n.trim());
    }
    if (data.primaryColorHex !== undefined) updateData['primaryColorHex'] = data.primaryColorHex;
    if (data.accentColorHex !== undefined) updateData['accentColorHex'] = data.accentColorHex;
    if (data.appName !== undefined) updateData['appName'] = data.appName.trim();

    const updated = await this.prisma.platformSettings.update({
      where: { id: currentSettings.id },
      data: updateData,
    });

    // 4. Audit Log
    if (this.auditLogger) {
      let tenantId: string | undefined;
      const adminUser = await this.prisma.user.findUnique({
        where: { id: adminUserId },
        select: { tenantId: true },
      });
      tenantId = adminUser?.tenantId;

      if (!tenantId) {
        const platformTenant = await this.prisma.tenant.findUnique({
          where: { slug: PLATFORM_TENANT_SLUG },
          select: { id: true },
        });
        tenantId = platformTenant?.id;
      }

      if (tenantId) {
        await this.auditLogger.log(
          tenantId,
          adminUserId,
          'UPDATE',
          'PlatformSettings',
          updated.id,
          `تم تحديث الإعدادات العامة للمنصة بنجاح`,
          'SUCCESS'
        );
      }
    }

    return {
      id: updated.id,
      supportEmail: updated.supportEmail,
      whatsappNumbers: updated.whatsappNumbers,
      primaryColorHex: updated.primaryColorHex,
      accentColorHex: updated.accentColorHex,
      appName: updated.appName,
      updatedAt: updated.updatedAt,
      message: 'تم تحديث إعدادات المنصة بنجاح',
    };
  }
}

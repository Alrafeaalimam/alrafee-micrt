// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/settings/GetPublicSettingsUseCase.ts
// Use Case: Retrieve Public Platform Settings (No Auth Required)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export interface PublicSettingsOutput {
  id: string;
  supportEmail: string;
  whatsappNumbers: string[];
  primaryColorHex: string | null;
  accentColorHex: string | null;
  appName: string;
  updatedAt: Date;
}

const DEFAULT_SETTINGS = {
  id: 'default-platform-settings',
  supportEmail: 'jalsahnetwork@gmail.com',
  whatsappNumbers: ['0115715672', '0115715651'],
  primaryColorHex: '#3B2FA0',
  accentColorHex: '#F5C94B',
  appName: 'Jalsah',
};

export class GetPublicSettingsUseCase {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async execute(): Promise<PublicSettingsOutput> {
    let settings = await this.prisma.platformSettings.findFirst();

    if (!settings) {
      settings = await this.prisma.platformSettings.create({
        data: DEFAULT_SETTINGS,
      });
    }

    return {
      id: settings.id,
      supportEmail: settings.supportEmail,
      whatsappNumbers: settings.whatsappNumbers,
      primaryColorHex: settings.primaryColorHex,
      accentColorHex: settings.accentColorHex,
      appName: settings.appName,
      updatedAt: settings.updatedAt,
    };
  }
}

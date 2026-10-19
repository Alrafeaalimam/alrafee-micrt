// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/GenerateLicenseCodeUseCase.ts
// Use Case: Generate Secure Alphanumeric License Code (SUPER_ADMIN only)
// ============================================================================

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export interface GenerateLicenseCodeInput {
  planName: string;
  durationDays: number;
  maxRoutersLimit: number;
  createdByUserId: string;
}

export interface GeneratedLicenseCodeOutput {
  id: string;
  code: string;
  planName: string;
  durationDays: number;
  maxRoutersLimit: number;
  status: string;
  createdByUserId: string;
  createdAt: Date;
}

export class GenerateLicenseCodeUseCase {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Generates a readable, cryptographically secure license code in format XXXX-XXXX-XXXX.
   * Uses uppercase letters and numbers excluding easily confused characters (0, O, 1, I).
   */
  private generateReadableCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const segment = (length: number) => {
      const bytes = crypto.randomBytes(length);
      let res = '';
      for (let i = 0; i < length; i++) {
        res += chars[bytes[i]! % chars.length];
      }
      return res;
    };
    return `${segment(4)}-${segment(4)}-${segment(4)}`;
  }

  async execute(input: GenerateLicenseCodeInput): Promise<GeneratedLicenseCodeOutput> {
    let code = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      code = this.generateReadableCode();
      const existing = await this.prisma.licenseCode.findUnique({
        where: { code },
      });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('تعذر توليد كود ترخيص فريد بعد عدة محاولات');
    }

    const licenseCode = await this.prisma.licenseCode.create({
      data: {
        code,
        planName: input.planName.trim(),
        durationDays: input.durationDays,
        maxRoutersLimit: input.maxRoutersLimit,
        createdByUserId: input.createdByUserId,
        status: 'UNUSED',
      },
    });

    return {
      id: licenseCode.id,
      code: licenseCode.code,
      planName: licenseCode.planName,
      durationDays: licenseCode.durationDays,
      maxRoutersLimit: licenseCode.maxRoutersLimit,
      status: licenseCode.status,
      createdByUserId: licenseCode.createdByUserId,
      createdAt: licenseCode.createdAt,
    };
  }
}

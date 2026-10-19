// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/ListLicenseCodesUseCase.ts
// Use Case: List All Generated License Codes for Platform Super Admin
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export interface LicenseCodeItem {
  id: string;
  code: string;
  planName: string;
  durationDays: number;
  maxRoutersLimit: number;
  status: string;
  createdByUserId: string;
  usedByTenantId: string | null;
  usedByTenantName: string | null;
  usedByTenantSlug: string | null;
  usedAt: Date | null;
  createdAt: Date;
}

export class ListLicenseCodesUseCase {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async execute(): Promise<LicenseCodeItem[]> {
    const codes = await this.prisma.licenseCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        usedByTenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return codes.map((c) => ({
      id: c.id,
      code: c.code,
      planName: c.planName,
      durationDays: c.durationDays,
      maxRoutersLimit: c.maxRoutersLimit,
      status: c.status,
      createdByUserId: c.createdByUserId,
      usedByTenantId: c.usedByTenantId,
      usedByTenantName: c.usedByTenant?.name ?? null,
      usedByTenantSlug: c.usedByTenant?.slug ?? null,
      usedAt: c.usedAt,
      createdAt: c.createdAt,
    }));
  }
}

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/ListTenantUsersUseCase.ts
// Use Case: List Users of a Specific Tenant for Platform Super Admin
// ============================================================================

import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export interface AdminTenantUserSummary {
  id: string;
  tenantId: string;
  username: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: Date;
}

export class ListTenantUsersUseCase {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async execute(tenantId: string): Promise<AdminTenantUserSummary[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant || tenant.isDeleted) {
      throw new Error('الشركة أو الشبكة غير موجودة');
    }

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        tenantId: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return users.map((u) => ({
      id: u.id,
      tenantId: u.tenantId,
      username: u.username,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
    }));
  }
}

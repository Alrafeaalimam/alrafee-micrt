// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/ListTenantsUseCase.ts
// Use Case: List All Registered Tenants for Platform Super Admin
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export interface AdminTenantSummary {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  contactPhone: string | null;
  currency: string;
  status: string;
  subscriptionStatus: string;
  approvalStatus: string;
  trialEndsAt: Date;
  subscriptionEndsAt: Date | null;
  planName: string | null;
  maxRoutersLimit: number;
  usersCount: number;
  routersCount: number;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ListTenantsUseCase {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async execute(): Promise<AdminTenantSummary[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        contactEmail: true,
        contactPhone: true,
        currency: true,
        status: true,
        subscriptionStatus: true,
        approvalStatus: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        planName: true,
        maxRoutersLimit: true,
        isDeleted: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            routers: true,
          },
        },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      contactEmail: t.contactEmail,
      contactPhone: t.contactPhone,
      currency: t.currency,
      status: t.status,
      subscriptionStatus: t.subscriptionStatus,
      approvalStatus: t.approvalStatus,
      trialEndsAt: t.trialEndsAt,
      subscriptionEndsAt: t.subscriptionEndsAt,
      planName: t.planName,
      maxRoutersLimit: t.maxRoutersLimit,
      usersCount: t._count.users,
      routersCount: t._count.routers,
      isDeleted: t.isDeleted,
      deletedAt: t.deletedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }
}

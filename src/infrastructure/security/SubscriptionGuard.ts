// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/security/SubscriptionGuard.ts
// Security / Service: Tenant Subscription & Licensing Guard
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma.js';
import { GenerateTrialEndingNotificationUseCase } from '../../application/use-cases/notifications/GenerateTrialEndingNotificationUseCase.js';

export type SubscriptionStatusEnum = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';

export interface TenantSubscriptionInfo {
  isAllowed: boolean;
  subscriptionStatus: SubscriptionStatusEnum;
  trialEndsAt: Date;
  subscriptionEndsAt: Date | null;
  daysRemaining: number;
  planName: string | null;
  currentRoutersCount: number;
  maxRoutersLimit: number;
}

export class SubscriptionGuard {
  private readonly generateTrialEndingUseCase: GenerateTrialEndingNotificationUseCase;

  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    generateTrialEndingUseCase?: GenerateTrialEndingNotificationUseCase
  ) {
    this.generateTrialEndingUseCase =
      generateTrialEndingUseCase ?? new GenerateTrialEndingNotificationUseCase(this.prisma);
  }

  /**
   * Verifies if a tenant is allowed to perform operations right now.
   * If TRIAL has passed trialEndsAt, automatically transitions to EXPIRED.
   * If ACTIVE has passed subscriptionEndsAt, automatically transitions to EXPIRED.
   * Returns true if ACTIVE or unexpired TRIAL, false otherwise.
   */
  async checkTenantAllowed(tenantId: string): Promise<boolean> {
    const info = await this.getTenantSubscriptionInfo(tenantId);
    return info.isAllowed;
  }

  /**
   * Retrieves full subscription status details for a tenant.
   */
  async getTenantSubscriptionInfo(tenantId: string): Promise<TenantSubscriptionInfo> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: { routers: true },
        },
      },
    });

    if (!tenant || tenant.isDeleted) {
      return {
        isAllowed: false,
        subscriptionStatus: 'EXPIRED',
        trialEndsAt: new Date(0),
        subscriptionEndsAt: null,
        daysRemaining: 0,
        planName: null,
        currentRoutersCount: 0,
        maxRoutersLimit: 0,
      };
    }

    const now = new Date();
    let currentStatus = tenant.subscriptionStatus as SubscriptionStatusEnum;

    // Auto-expire trial if trialEndsAt has passed
    if (currentStatus === 'TRIAL' && tenant.trialEndsAt.getTime() <= now.getTime()) {
      currentStatus = 'EXPIRED';
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: 'EXPIRED' },
      });
    }

    // Auto-expire active subscription if subscriptionEndsAt has passed
    if (
      currentStatus === 'ACTIVE' &&
      tenant.subscriptionEndsAt &&
      tenant.subscriptionEndsAt.getTime() <= now.getTime()
    ) {
      currentStatus = 'EXPIRED';
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: 'EXPIRED' },
      });
    }

    const isAllowed =
      !tenant.isDeleted &&
      currentStatus !== 'SUSPENDED' &&
      (currentStatus === 'ACTIVE' || currentStatus === 'TRIAL');

    let daysRemaining = 0;
    if (currentStatus === 'TRIAL' && tenant.trialEndsAt.getTime() > now.getTime()) {
      const diffMs = tenant.trialEndsAt.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      if (daysRemaining <= 2) {
        try {
          await this.generateTrialEndingUseCase.execute({ tenantId, daysRemaining });
        } catch {
          // Non-blocking background notification trigger
        }
      }
    } else if (
      currentStatus === 'ACTIVE' &&
      tenant.subscriptionEndsAt &&
      tenant.subscriptionEndsAt.getTime() > now.getTime()
    ) {
      const diffMs = tenant.subscriptionEndsAt.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      isAllowed,
      subscriptionStatus: currentStatus,
      trialEndsAt: tenant.trialEndsAt,
      subscriptionEndsAt: tenant.subscriptionEndsAt ?? null,
      daysRemaining,
      planName: tenant.planName,
      currentRoutersCount: tenant._count?.routers ?? 0,
      maxRoutersLimit: tenant.maxRoutersLimit,
    };
  }
}

export const subscriptionGuard = new SubscriptionGuard();

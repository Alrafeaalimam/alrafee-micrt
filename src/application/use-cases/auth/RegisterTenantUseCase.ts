// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/auth/RegisterTenantUseCase.ts
// Application Use Case: Public Self-Registration for New Tenants & Admins (Rule 14, 19, 32)
// ============================================================================

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { IEmailService, defaultEmailService } from '../../../infrastructure/email/EmailService.js';
import { hashPassword } from '../../../infrastructure/security/password.js';
import { ConflictException } from '../../../domain/exceptions/ConflictException.js';

export interface RegisterTenantInput {
  networkName: string;
  adminFullName: string;
  username: string;
  email: string;
  password: string;
  phone?: string | null | undefined;
  ip?: string | undefined;
}

export interface RegisterTenantOutput {
  message: string;
  token?: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
    approvalStatus: string;
    subscriptionStatus: string;
    trialEndsAt: string;
    maxRoutersLimit: number;
  };
  user: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    role: string;
    tenantId: string;
  };
}

export class RegisterTenantUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger?: IAuditLogger,
    private readonly emailService: IEmailService = defaultEmailService
  ) {}

  async execute(input: RegisterTenantInput): Promise<RegisterTenantOutput> {
    const trimmedNetworkName = input.networkName.trim();
    const trimmedAdminFullName = input.adminFullName.trim();
    const trimmedUsername = input.username.trim();
    const trimmedEmail = input.email.trim().toLowerCase();
    const trimmedPhone = input.phone?.trim() || null;

    // 1. Global uniqueness check: Username across all tenants
    const existingByUsername = await this.prisma.user.findFirst({
      where: {
        username: {
          equals: trimmedUsername,
          mode: 'insensitive',
        },
      },
    });

    if (existingByUsername) {
      throw new ConflictException(
        'اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر',
        'USERNAME_ALREADY_EXISTS'
      );
    }

    // 2. Global uniqueness check: Email across all tenants
    const existingByEmail = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: trimmedEmail,
          mode: 'insensitive',
        },
      },
    });

    if (existingByEmail) {
      throw new ConflictException(
        'البريد الإلكتروني مسجل مسبقاً، يرجى استخدام بريد آخر',
        'EMAIL_ALREADY_EXISTS'
      );
    }

    // 3. Generate collision-free unique slug
    const uniqueSlug = await this.generateUniqueSlug(trimmedNetworkName);

    // 4. Hash password
    const passwordHash = await hashPassword(input.password);

    // 5. Calculate configurable trial expiration from PlatformSettings (default 7 days)
    const platformSettings = await this.prisma.platformSettings.findFirst().catch(() => null);
    const trialDays = (platformSettings as any)?.defaultTrialDays ?? 7;
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    // 6. Atomically provision Tenant and initial TENANT_ADMIN user
    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          id: crypto.randomUUID(),
          name: trimmedNetworkName,
          slug: uniqueSlug,
          contactEmail: trimmedEmail,
          contactPhone: trimmedPhone,
          currency: 'SDG',
          status: 'ACTIVE',
          subscriptionStatus: 'TRIAL',
          approvalStatus: 'PENDING',
          trialEndsAt,
          maxRoutersLimit: 2, // Standard default for trial networks
        },
      });

      const createdUser = await tx.user.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: createdTenant.id,
          username: trimmedUsername,
          email: trimmedEmail,
          passwordHash,
          fullName: trimmedAdminFullName,
          phone: trimmedPhone,
          role: 'TENANT_ADMIN',
          status: 'ACTIVE',
        },
      });

      return { tenant: createdTenant, user: createdUser };
    });

    // 7. Record security audit log
    if (this.auditLogger) {
      await this.auditLogger.log(
        tenant.id,
        user.id,
        'CREATE',
        'Tenant',
        tenant.id,
        `Public self-registration for network "${tenant.name}" by admin "${user.username}" (Pending Approval)`,
        'SUCCESS'
      );
    }

    // 8. Send welcome email to tenant owner asynchronously (non-blocking)
    if (user.email && this.emailService) {
      Promise.resolve(this.emailService.sendWelcomeEmail(user.email, tenant.name))
        .catch((emailErr) => {
          console.error('[RegisterTenantUseCase] Non-blocking welcome email failed:', emailErr);
        });
    }

    // 9. Return pending approval response without JWT per requirements
    return {
      message: 'تم إرسال طلبك، بانتظار موافقة الإدارة',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        approvalStatus: tenant.approvalStatus,
        subscriptionStatus: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt.toISOString(),
        maxRoutersLimit: tenant.maxRoutersLimit,
      },
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  private async generateUniqueSlug(networkName: string): Promise<string> {
    let base = networkName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!base || base.length < 2) {
      base = 'net';
    } else if (base.length > 30) {
      base = base.substring(0, 30).replace(/-$/, '');
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const randomSuffix = crypto.randomBytes(3).toString('hex');
      const candidateSlug = `${base}-${randomSuffix}`;

      const existing = await this.prisma.tenant.findUnique({
        where: { slug: candidateSlug },
      });

      if (!existing) {
        return candidateSlug;
      }
    }

    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }
}

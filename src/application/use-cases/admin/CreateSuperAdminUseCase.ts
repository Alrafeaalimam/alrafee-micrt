// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System (Jalsah)
// File: src/application/use-cases/admin/CreateSuperAdminUseCase.ts
// Application Use Case: Create New Platform Super Admin User (Rule 14, Rule 26)
// ============================================================================

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { hashPassword } from '../../../infrastructure/security/password.js';
import { ConflictException } from '../../../domain/exceptions/ConflictException.js';
import { PLATFORM_TENANT_SLUG } from '../../../infrastructure/database/seed.js';

export interface CreateSuperAdminInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
  adminUserId: string;
}

export interface CreateSuperAdminOutput {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
  status: string;
  tenantId: string;
  createdAt: Date;
}

export class CreateSuperAdminUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: CreateSuperAdminInput): Promise<CreateSuperAdminOutput> {
    const trimmedFullName = input.fullName.trim();
    const trimmedUsername = input.username.trim();
    const trimmedEmail = input.email.trim().toLowerCase();

    if (!trimmedFullName || !trimmedUsername || !trimmedEmail || !input.password) {
      throw new Error('جميع البيانات مطلوبة لإنشاء مدير المنصة');
    }

    if (input.password.length < 8) {
      throw new Error('كلمة المرور يجب ألا تقل عن 8 أحرف');
    }

    // 1. Verify username uniqueness across the platform
    const existingUsername = await this.prisma.user.findFirst({
      where: {
        username: {
          equals: trimmedUsername,
          mode: 'insensitive',
        },
      },
    });

    if (existingUsername) {
      throw new ConflictException(
        'اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر',
        'USERNAME_ALREADY_EXISTS'
      );
    }

    // 2. Verify email uniqueness across the platform
    const existingEmail = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: trimmedEmail,
          mode: 'insensitive',
        },
      },
    });

    if (existingEmail) {
      throw new ConflictException(
        'البريد الإلكتروني مسجل مسبقاً، يرجى استخدام بريد آخر',
        'EMAIL_ALREADY_EXISTS'
      );
    }

    // 3. Find platform tenant (not commercial tenant)
    let platformTenant = await this.prisma.tenant.findUnique({
      where: { slug: PLATFORM_TENANT_SLUG },
    });

    if (!platformTenant) {
      // Find tenant associated with an existing SUPER_ADMIN
      const existingSuperAdmin = await this.prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' },
        include: { tenant: true },
      });
      if (existingSuperAdmin) {
        platformTenant = existingSuperAdmin.tenant;
      }
    }

    if (!platformTenant) {
      throw new Error('تعذر العثور على مساحة منصة الإدارة (Platform Tenant)');
    }

    // 4. Hash password
    const passwordHash = await hashPassword(input.password);

    // 5. Create new SUPER_ADMIN user
    const newUser = await this.prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: platformTenant.id,
        fullName: trimmedFullName,
        username: trimmedUsername,
        email: trimmedEmail,
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        tenantId: true,
        createdAt: true,
      },
    });

    // 6. Audit log
    if (this.auditLogger) {
      await this.auditLogger.log(
        platformTenant.id,
        input.adminUserId,
        'CREATE',
        'User',
        newUser.id,
        `تم إنشاء مدير منصة جديد (SUPER_ADMIN) "${newUser.username}" (${newUser.fullName}) بواسطة مدير المنصة`,
        'SUCCESS'
      );
    }

    return newUser;
  }
}

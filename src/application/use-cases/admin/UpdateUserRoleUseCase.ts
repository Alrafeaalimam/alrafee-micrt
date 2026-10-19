// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/admin/UpdateUserRoleUseCase.ts
// Use Case: Update User Role by Super Admin (Role Promotion & Access Control)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';

export const ALLOWED_ROLES = [
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'OPERATOR',
  'RESELLER',
  'ACCOUNTANT',
] as const;

export type AllowedUserRole = (typeof ALLOWED_ROLES)[number];

export interface UpdateUserRoleInput {
  targetUserId: string;
  newRole: string;
  adminUserId: string;
}

export class UpdateUserRoleUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: UpdateUserRoleInput) {
    const normalizedRole = input.newRole.trim().toUpperCase() as AllowedUserRole;

    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      throw new Error(`الدور المطلوب غير صالح (${input.newRole}). الأدوار المتاحة: ${ALLOWED_ROLES.join(', ')}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.targetUserId },
      include: { tenant: true },
    });

    if (!user) {
      throw new Error('المستخدم المطلوب غير موجود');
    }

    if (user.tenant.isDeleted) {
      throw new Error('لا يمكن تعديل مستخدم تابع لشركة محذوفة');
    }

    const previousRole = user.role;

    const updatedUser = await this.prisma.user.update({
      where: { id: input.targetUserId },
      data: { role: normalizedRole },
    });

    if (this.auditLogger) {
      await this.auditLogger.log(
        user.tenantId,
        input.adminUserId,
        'UPDATE',
        'User',
        user.id,
        `تم تعديل دور المستخدم "${user.username}" (${user.fullName}) من [${previousRole}] إلى [${normalizedRole}] بواسطة مدير المنصة`,
        'SUCCESS'
      );
    }

    return {
      id: updatedUser.id,
      username: updatedUser.username,
      fullName: updatedUser.fullName,
      tenantId: updatedUser.tenantId,
      tenantName: user.tenant.name,
      previousRole,
      newRole: updatedUser.role,
      message: `تم ترقية وتعديل دور المستخدم "${user.username}" بنجاح إلى (${normalizedRole})`,
    };
  }
}

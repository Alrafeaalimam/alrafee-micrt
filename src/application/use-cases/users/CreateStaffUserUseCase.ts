// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/users/CreateStaffUserUseCase.ts
// Application Use Case: Create Staff User (Rule 14, Rule 16, Rule 26)
// ============================================================================

import { IUserRepository } from '../../interfaces/IUserRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { hashPassword } from '../../../infrastructure/security/password.js';
import { ForbiddenException } from '../../../domain/exceptions/ForbiddenException.js';

export interface CreateStaffUserInputDto {
  callerId: string;
  callerRole: string;
  tenantId: string;
  username: string;
  password: string;
  fullName: string;
  role: 'TENANT_ADMIN' | 'OPERATOR' | 'RESELLER' | 'ACCOUNTANT';
  email?: string | null | undefined;
  phone?: string | null | undefined;
}

export interface SafeUserOutput {
  id: string;
  tenantId: string;
  username: string;
  fullName: string;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateStaffUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: CreateStaffUserInputDto): Promise<SafeUserOutput> {
    // 1. Role verification: only TENANT_ADMIN or SUPER_ADMIN
    if (input.callerRole !== 'TENANT_ADMIN' && input.callerRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('ليس لديك صلاحية لإضافة مستخدمين جدد');
    }

    const trimmedUsername = input.username.trim();

    // 2. Check if username already exists within the tenant
    const existing = await this.userRepository.findByTenantAndUsername(
      input.tenantId,
      trimmedUsername
    );
    if (existing) {
      const err: any = new Error(`اسم المستخدم "${trimmedUsername}" مسجل مسبقاً في هذه الشبكة`);
      err.code = 'USERNAME_EXISTS';
      throw err;
    }

    // 3. Hash password
    const passwordHash = await hashPassword(input.password);

    // 4. Create user record
    const user = await this.userRepository.createStaffUser({
      tenantId: input.tenantId,
      username: trimmedUsername,
      passwordHash,
      fullName: input.fullName.trim(),
      role: input.role,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    });

    // 5. Audit Logging
    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.callerId,
        'CREATE',
        'User',
        user.id,
        `Created staff user "${user.username}" with role "${user.role}"`,
        'SUCCESS'
      );
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      username: user.username,
      fullName: user.fullName,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

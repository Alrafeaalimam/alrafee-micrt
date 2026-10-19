// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/users/DeactivateStaffUseCase.ts
// Application Use Case: Deactivate Staff User (Rule 14, Rule 16)
// ============================================================================

import { IUserRepository } from '../../interfaces/IUserRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { ForbiddenException } from '../../../domain/exceptions/ForbiddenException.js';
import { SafeUserOutput } from './CreateStaffUserUseCase.js';

export interface DeactivateStaffInputDto {
  callerId: string;
  callerRole: string;
  tenantId: string;
  targetUserId: string;
}

export class DeactivateStaffUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: DeactivateStaffInputDto): Promise<SafeUserOutput> {
    if (input.callerRole !== 'TENANT_ADMIN' && input.callerRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('ليس لديك صلاحية لتعطيل حسابات الموظفين');
    }

    if (input.callerId === input.targetUserId) {
      const err: any = new Error('لا يمكن للمسؤول تعطيل حسابه الشخصي');
      err.code = 'CANNOT_DEACTIVATE_SELF';
      throw err;
    }

    const targetUser = await this.userRepository.findByIdAndTenant(
      input.targetUserId,
      input.tenantId
    );

    if (!targetUser) {
      const err: any = new Error('المستخدم المطلوب غير موجود في هذه الشبكة');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const updatedUser = await this.userRepository.deactivateUser(
      input.targetUserId,
      input.tenantId
    );

    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.callerId,
        'UPDATE',
        'User',
        targetUser.id,
        `Deactivated staff user "${targetUser.username}" (${targetUser.role})`,
        'SUCCESS'
      );
    }

    return {
      id: updatedUser.id,
      tenantId: updatedUser.tenantId,
      username: updatedUser.username,
      fullName: updatedUser.fullName,
      email: updatedUser.email ?? null,
      phone: updatedUser.phone ?? null,
      role: updatedUser.role,
      status: updatedUser.status,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }
}

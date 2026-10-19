// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/users/ListStaffUseCase.ts
// Application Use Case: List Staff Users for Tenant (Rule 14, Rule 16)
// ============================================================================

import { IUserRepository } from '../../interfaces/IUserRepository.js';
import { ForbiddenException } from '../../../domain/exceptions/ForbiddenException.js';
import { SafeUserOutput } from './CreateStaffUserUseCase.js';

export interface ListStaffInputDto {
  callerId: string;
  callerRole: string;
  tenantId: string;
}

export class ListStaffUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(input: ListStaffInputDto): Promise<SafeUserOutput[]> {
    if (input.callerRole !== 'TENANT_ADMIN' && input.callerRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('ليس لديك صلاحية لعرض قائمة الموظفين');
    }

    const users = await this.userRepository.findAllByTenant(input.tenantId);

    return users.map((u) => ({
      id: u.id,
      tenantId: u.tenantId,
      username: u.username,
      fullName: u.fullName,
      email: u.email ?? null,
      phone: u.phone ?? null,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }
}

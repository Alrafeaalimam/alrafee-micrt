// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/packages/ListPackagesUseCase.ts
// Application Use Case: List All Packages for a Tenant (Rule 16)
// ============================================================================

import { IPackageRepository, Package } from '../../interfaces/IPackageRepository.js';

export interface ListPackagesInput {
  tenantId: string;
}

export class ListPackagesUseCase {
  constructor(private readonly packageRepository: IPackageRepository) {}

  async execute(input: ListPackagesInput): Promise<Package[]> {
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID is required to list packages');
    }
    return await this.packageRepository.findAllByTenant(input.tenantId);
  }
}

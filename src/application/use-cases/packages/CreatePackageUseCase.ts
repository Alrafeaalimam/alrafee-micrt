// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/packages/CreatePackageUseCase.ts
// Application Use Case: Create Package Entity (Rule 16)
// ============================================================================

import {
  IPackageRepository,
  Package,
  CreatePackageData,
} from '../../interfaces/IPackageRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';

export type CreatePackageInput = CreatePackageData & {
  userId?: string | null;
};

export class CreatePackageUseCase {
  constructor(
    private readonly packageRepository: IPackageRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: CreatePackageInput): Promise<Package> {
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID cannot be empty');
    }
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Package name cannot be empty');
    }
    if (!input.code || input.code.trim().length === 0) {
      throw new Error('Package code cannot be empty');
    }
    if (!input.downloadSpeedLimit || input.downloadSpeedLimit.trim().length === 0) {
      throw new Error('Download speed limit cannot be empty');
    }
    if (!input.uploadSpeedLimit || input.uploadSpeedLimit.trim().length === 0) {
      throw new Error('Upload speed limit cannot be empty');
    }
    if (input.durationMinutes === undefined || input.durationMinutes <= 0) {
      throw new Error('Duration minutes must be a positive integer');
    }
    if (input.validityDays === undefined || input.validityDays <= 0) {
      throw new Error('Validity days must be a positive integer');
    }
    if (input.price === undefined || input.price <= 0) {
      throw new Error('Price must be a positive number');
    }
    if (input.dataLimitBytes !== undefined && Number(input.dataLimitBytes) < 0) {
      throw new Error('Data limit bytes must be >= 0');
    }
    if (!input.hotspotProfileName || input.hotspotProfileName.trim().length === 0) {
      throw new Error('Hotspot profile name cannot be empty');
    }

    const pkg = await this.packageRepository.create(input);

    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.userId ?? null,
        'CREATE',
        'Package',
        pkg.id,
        `Created package "${pkg.name}" (${pkg.code})`,
        'SUCCESS'
      );
    }

    return pkg;
  }
}

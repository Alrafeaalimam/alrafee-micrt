// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/packages/UpdatePackageUseCase.ts
// Application Use Case: Update Package Details (Rule 16)
// ============================================================================

import {
  IPackageRepository,
  Package,
  UpdatePackageData,
} from '../../interfaces/IPackageRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';

export interface UpdatePackageInput extends UpdatePackageData {
  id: string;
  tenantId: string;
  userId?: string | null;
}

export class UpdatePackageUseCase {
  constructor(
    private readonly packageRepository: IPackageRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: UpdatePackageInput): Promise<Package> {
    const { id, tenantId, userId, ...data } = input;
    if (!id || id.trim().length === 0) {
      throw new Error('Package ID is required for update');
    }
    if (!tenantId || tenantId.trim().length === 0) {
      throw new Error('Tenant ID is required for update');
    }
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new Error('Package name cannot be empty');
    }
    if (data.code !== undefined && data.code.trim().length === 0) {
      throw new Error('Package code cannot be empty');
    }
    if (data.downloadSpeedLimit !== undefined && data.downloadSpeedLimit.trim().length === 0) {
      throw new Error('Download speed limit cannot be empty');
    }
    if (data.uploadSpeedLimit !== undefined && data.uploadSpeedLimit.trim().length === 0) {
      throw new Error('Upload speed limit cannot be empty');
    }
    if (data.durationMinutes !== undefined && data.durationMinutes <= 0) {
      throw new Error('Duration minutes must be a positive integer');
    }
    if (data.validityDays !== undefined && data.validityDays <= 0) {
      throw new Error('Validity days must be a positive integer');
    }
    if (data.price !== undefined && data.price <= 0) {
      throw new Error('Price must be a positive number');
    }
    if (data.dataLimitBytes !== undefined && Number(data.dataLimitBytes) < 0) {
      throw new Error('Data limit bytes must be >= 0');
    }
    if (data.hotspotProfileName !== undefined && data.hotspotProfileName.trim().length === 0) {
      throw new Error('Hotspot profile name cannot be empty');
    }

    const updated = await this.packageRepository.update(id, tenantId, data);

    if (this.auditLogger) {
      await this.auditLogger.log(
        tenantId,
        userId ?? null,
        'UPDATE',
        'Package',
        updated.id,
        `Updated package "${updated.name}" (${updated.code})`,
        'SUCCESS'
      );
    }

    return updated;
  }
}

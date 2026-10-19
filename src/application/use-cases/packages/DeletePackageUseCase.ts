// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/packages/DeletePackageUseCase.ts
// Application Use Case: Delete Package Entity (Rule 16)
// ============================================================================

import { IPackageRepository } from '../../interfaces/IPackageRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';

export interface DeletePackageInput {
  id: string;
  tenantId: string;
  userId?: string | null;
}

export class DeletePackageUseCase {
  constructor(
    private readonly packageRepository: IPackageRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: DeletePackageInput): Promise<void> {
    if (!input.id || input.id.trim().length === 0) {
      throw new Error('Package ID is required for deletion');
    }
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID is required for deletion');
    }

    await this.packageRepository.delete(input.id, input.tenantId);

    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.userId ?? null,
        'DELETE',
        'Package',
        input.id,
        `Deleted package ${input.id}`,
        'SUCCESS'
      );
    }
  }
}

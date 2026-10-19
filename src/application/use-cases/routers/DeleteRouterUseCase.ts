// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/routers/DeleteRouterUseCase.ts
// Application Use Case: Remove Router from System (Rule 16)
// ============================================================================

import { IRouterRepository } from '../../interfaces/IRouterRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';

export interface DeleteRouterInput {
  id: string;
  tenantId: string;
  userId?: string | null;
}

export class DeleteRouterUseCase {
  constructor(
    private readonly routerRepository: IRouterRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: DeleteRouterInput): Promise<void> {
    if (!input.id) {
      throw new Error('Router ID is required for deletion');
    }
    if (!input.tenantId) {
      throw new Error('Tenant ID is required for deletion');
    }

    await this.routerRepository.delete(input.id, input.tenantId);

    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.userId ?? null,
        'DELETE',
        'Router',
        input.id,
        `Deleted router ${input.id}`,
        'SUCCESS'
      );
    }
  }
}

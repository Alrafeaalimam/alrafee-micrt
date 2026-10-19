// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/routers/UpdateRouterUseCase.ts
// Application Use Case: Update Router Configuration & Credentials (Rule 16)
// ============================================================================

import {
  IRouterRepository,
  Router,
  UpdateRouterData,
} from '../../interfaces/IRouterRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';

export interface UpdateRouterInput extends UpdateRouterData {
  id: string;
  tenantId: string;
  userId?: string | null;
}

export class UpdateRouterUseCase {
  constructor(
    private readonly routerRepository: IRouterRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: UpdateRouterInput): Promise<Router> {
    const { id, tenantId, userId, ...data } = input;
    if (!id) {
      throw new Error('Router ID is required for update');
    }
    if (!tenantId) {
      throw new Error('Tenant ID is required for update');
    }

    const updated = await this.routerRepository.update(id, tenantId, data);

    if (this.auditLogger) {
      await this.auditLogger.log(
        tenantId,
        userId ?? null,
        'UPDATE',
        'Router',
        updated.id,
        `Updated router "${updated.name}" (${updated.host})`,
        'SUCCESS'
      );
    }

    return updated;
  }
}

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/routers/ListRoutersUseCase.ts
// Application Use Case: List All Routers for a Tenant (Rule 16)
// ============================================================================

import { IRouterRepository, Router } from '../../interfaces/IRouterRepository.js';

export interface ListRoutersInput {
  tenantId: string;
}

export class ListRoutersUseCase {
  constructor(private readonly routerRepository: IRouterRepository) {}

  async execute(input: ListRoutersInput): Promise<Router[]> {
    if (!input.tenantId) {
      throw new Error('Tenant ID is required to list routers');
    }
    return await this.routerRepository.findAllByTenant(input.tenantId);
  }
}

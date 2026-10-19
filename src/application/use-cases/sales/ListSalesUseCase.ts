// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/sales/ListSalesUseCase.ts
// Application Use Case: List Sales Transactions with Details
// Master Reference: Rule 8 (Sales), Rule 16 (Clean Architecture)
// ============================================================================

import { ISaleRepository, Sale } from '../../interfaces/ISaleRepository.js';

export interface ListSalesInput {
  tenantId: string;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
}

export class ListSalesUseCase {
  constructor(private readonly saleRepository: ISaleRepository) {}

  async execute(input: ListSalesInput): Promise<Sale[]> {
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID cannot be empty');
    }

    return this.saleRepository.findAllByTenant(
      input.tenantId,
      input.dateFrom,
      input.dateTo
    );
  }
}

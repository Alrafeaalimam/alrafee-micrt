// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/sales/GetTodaySalesUseCase.ts
// Application Use Case: Retrieve Today's Total Sales Revenue for Tenant
// Master Reference: Rule 8 (Sales), Rule 16 (Clean Architecture)
// ============================================================================

import { ISaleRepository } from '../../interfaces/ISaleRepository.js';

export interface GetTodaySalesInput {
  tenantId: string;
}

export interface TodaySalesOutput {
  tenantId: string;
  todayTotal: number;
  totalAmount: number;
}

export class GetTodaySalesUseCase {
  constructor(private readonly saleRepository: ISaleRepository) {}

  async execute(input: GetTodaySalesInput): Promise<TodaySalesOutput> {
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID cannot be empty');
    }

    const total = await this.saleRepository.getTodaySalesTotal(input.tenantId);

    return {
      tenantId: input.tenantId,
      todayTotal: total,
      totalAmount: total,
    };
  }
}

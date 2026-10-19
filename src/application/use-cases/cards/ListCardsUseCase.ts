// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/cards/ListCardsUseCase.ts
// Application Use Case: List Cards with Status and Batch Filters
// Master Reference: Rule 9 (Cards), Rule 16 (Clean Architecture)
// ============================================================================

import {
  ICardRepository,
  Card,
  FindCardsFilter,
} from '../../interfaces/ICardRepository.js';
import { CardStatus } from '../../../domain/state-machines/CardStateMachine.js';

export interface ListCardsInput {
  tenantId: string;
  status?: CardStatus | undefined;
  batchId?: string | undefined;
}

export class ListCardsUseCase {
  constructor(private readonly cardRepository: ICardRepository) {}

  async execute(input: ListCardsInput): Promise<Card[]> {
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID cannot be empty');
    }

    const filter: FindCardsFilter = {};
    if (input.status) {
      filter.status = input.status;
    }
    if (input.batchId) {
      filter.batchId = input.batchId;
    }

    return this.cardRepository.findAllByTenant(input.tenantId, filter);
  }
}

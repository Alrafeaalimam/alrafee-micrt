// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/sales/CreateSaleUseCase.ts
// Application Use Case: Record Sale Transaction with Domain State Machine Enforcement
// Master Reference: Rule 8 (Sales), Rule 9 (Cards Lifecycle), Rule 16 (Clean Architecture)
// ============================================================================

import {
  ISaleRepository,
  Sale,
  PaymentMethod,
} from '../../interfaces/ISaleRepository.js';
import { ICardRepository, Card } from '../../interfaces/ICardRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { CardStateMachine } from '../../../domain/state-machines/CardStateMachine.js';

export interface CreateSaleUseCaseInput {
  tenantId: string;
  soldById: string;
  cardIds: string[];
  paymentMethod: PaymentMethod;
}

export class CreateSaleUseCase {
  constructor(
    private readonly saleRepository: ISaleRepository,
    private readonly cardRepository: ICardRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: CreateSaleUseCaseInput): Promise<Sale> {
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID cannot be empty');
    }
    if (!input.soldById || input.soldById.trim().length === 0) {
      throw new Error('Sold By User ID cannot be empty');
    }
    if (
      !input.cardIds ||
      !Array.isArray(input.cardIds) ||
      input.cardIds.length === 0
    ) {
      throw new Error('Card IDs array must not be empty');
    }

    // Check for duplicate card IDs in request
    const uniqueIds = new Set(input.cardIds);
    if (uniqueIds.size !== input.cardIds.length) {
      throw new Error('Duplicate card IDs provided in sale request');
    }

    // 1. Fetch cards for this tenant
    const cards = await this.cardRepository.findByIds(
      input.cardIds,
      input.tenantId
    );

    // Verify all requested cards exist
    const foundCardMap = new Map<string, Card>();
    for (const c of cards) {
      foundCardMap.set(c.id, c);
    }

    const missingIds = input.cardIds.filter((id) => !foundCardMap.has(id));
    if (missingIds.length > 0) {
      throw new Error(`Cards not found for tenant: ${missingIds.join(', ')}`);
    }

    // 2. Verify all cards are currently AVAILABLE and apply CardStateMachine transition check
    const unavailableCards: Array<{
      id: string;
      username: string;
      status: string;
    }> = [];

    for (const card of cards) {
      if (card.status !== 'AVAILABLE') {
        unavailableCards.push({
          id: card.id,
          username: card.username,
          status: card.status,
        });
      } else {
        // Enforce CardStateMachine transition from AVAILABLE to SOLD
        CardStateMachine.transition(card.status, 'SOLD');
      }
    }

    if (unavailableCards.length > 0) {
      const details = unavailableCards
        .map(
          (c) =>
            `Card '${c.id}' (username: '${c.username}') is in '${c.status}' state and is not AVAILABLE for sale`
        )
        .join('; ');
      throw new Error(`Cannot complete sale: ${details}`);
    }

    // 3. Calculate totalAmount from card prices
    const totalAmount = cards.reduce((sum, card) => {
      const p = typeof card.price === 'number' ? card.price : Number(card.price);
      return sum + p;
    }, 0);
    const roundedTotal = Math.round(totalAmount * 100) / 100;

    const items = cards.map((card) => ({
      cardId: card.id,
      unitPrice:
        typeof card.price === 'number' ? card.price : Number(card.price),
    }));

    // 4. Create Sale atomically in repository
    const sale = await this.saleRepository.create({
      tenantId: input.tenantId,
      soldById: input.soldById,
      totalAmount: roundedTotal,
      paymentMethod: input.paymentMethod,
      items,
    });

    // 5. Audit Logging (action: SELL_CARDS)
    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.soldById,
        'SELL_CARDS',
        'Sale',
        sale.id,
        `Sold ${cards.length} card(s) for total amount ${roundedTotal} via ${input.paymentMethod}. Cards: ${cards.map((c) => c.username).join(', ')}`,
        'SUCCESS'
      );
    }

    return sale;
  }
}

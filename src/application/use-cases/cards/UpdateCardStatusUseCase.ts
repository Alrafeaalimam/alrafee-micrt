// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/cards/UpdateCardStatusUseCase.ts
// Application Use Case: Transition Card Status Governed by Domain State Machine
// Master Reference: Rule 9 (Cards), Rule 16 (Clean Architecture)
// ============================================================================

import { ICardRepository, Card } from '../../interfaces/ICardRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import {
  CardStateMachine,
  CardStatus,
} from '../../../domain/state-machines/CardStateMachine.js';

export interface UpdateCardStatusInput {
  cardId: string;
  tenantId: string;
  newStatus: CardStatus;
  userId?: string | null | undefined;
}

export class UpdateCardStatusUseCase {
  constructor(
    private readonly cardRepository: ICardRepository,
    private readonly auditLogger?: IAuditLogger
  ) {}

  async execute(input: UpdateCardStatusInput): Promise<Card> {
    if (!input.cardId || input.cardId.trim().length === 0) {
      throw new Error('Card ID cannot be empty');
    }
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID cannot be empty');
    }

    // 1. Fetch current card
    const card = await this.cardRepository.findById(input.cardId, input.tenantId);
    if (!card) {
      throw new Error(`Card with ID '${input.cardId}' not found for tenant`);
    }

    // 2. Strict State Machine Validation
    // Throws InvalidCardTransitionException if the transition is prohibited
    const targetStatus = CardStateMachine.transition(card.status, input.newStatus);

    // 3. Update status in repository
    const updatedCard = await this.cardRepository.updateStatus(
      input.cardId,
      input.tenantId,
      targetStatus
    );

    // 4. Audit Logging
    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.userId ?? null,
        'UPDATE',
        'Card',
        card.id,
        `Transitioned card status from '${card.status}' to '${targetStatus}'`,
        'SUCCESS'
      );
    }

    return updatedCard;
  }
}

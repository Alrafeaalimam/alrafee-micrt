// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/state-machines/CardStateMachine.ts
// State Machine: Card Lifecycle Governance
// Master Reference: Rule 9 (Card System), Rule 16 (Clean Architecture)
// Pure Domain Logic - Zero External Dependencies
// ============================================================================

import { InvalidCardTransitionException } from '../exceptions/InvalidCardTransitionException.js';

/**
 * CardStatus matching the PostgreSQL enum defined in schema.prisma.
 */
export type CardStatus =
  | 'GENERATED'
  | 'AVAILABLE'
  | 'SOLD'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SUSPENDED'
  | 'REVOKED';

/**
 * Immutable mapping of strictly permitted state transitions.
 * Terminal states (EXPIRED, CANCELLED, REVOKED) have empty transition arrays.
 */
export const ALLOWED_CARD_TRANSITIONS: Readonly<Record<CardStatus, readonly CardStatus[]>> = Object.freeze({
  GENERATED: Object.freeze(['AVAILABLE', 'CANCELLED'] as const),
  AVAILABLE: Object.freeze(['SOLD', 'CANCELLED'] as const),
  SOLD: Object.freeze(['ACTIVE', 'CANCELLED'] as const),
  ACTIVE: Object.freeze(['EXPIRED', 'SUSPENDED', 'REVOKED'] as const),
  SUSPENDED: Object.freeze(['ACTIVE', 'REVOKED'] as const),
  EXPIRED: Object.freeze([] as const),
  CANCELLED: Object.freeze([] as const),
  REVOKED: Object.freeze([] as const),
});

/**
 * Pure Domain State Machine controlling the lifecycle of hotspot cards.
 */
export class CardStateMachine {
  /**
   * Evaluates if a state transition is valid according to business rules.
   */
  public static canTransition(from: CardStatus, to: CardStatus): boolean {
    const validNextStates = ALLOWED_CARD_TRANSITIONS[from];
    if (!validNextStates) {
      return false;
    }
    return validNextStates.includes(to);
  }

  /**
   * Applies the state transition if valid, or throws InvalidCardTransitionException.
   *
   * @param from - The current card status
   * @param to - The requested target card status
   * @returns The new card status (to)
   * @throws InvalidCardTransitionException if the transition is prohibited
   */
  public static transition(from: CardStatus, to: CardStatus): CardStatus {
    if (!this.canTransition(from, to)) {
      throw new InvalidCardTransitionException(from, to);
    }
    return to;
  }

  // Instance method delegates for dependency injection and object-oriented consumption
  public canTransition(from: CardStatus, to: CardStatus): boolean {
    return CardStateMachine.canTransition(from, to);
  }

  public transition(from: CardStatus, to: CardStatus): CardStatus {
    return CardStateMachine.transition(from, to);
  }
}

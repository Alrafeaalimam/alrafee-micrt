// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/InvalidCardTransitionException.ts
// Domain Exception: Thrown when an illegal card state transition is attempted
// Pure Domain Logic - Zero External Dependencies
// ============================================================================

export class InvalidCardTransitionException extends Error {
  public readonly fromStatus: string;
  public readonly toStatus: string;

  constructor(from: string, to: string) {
    super(`Invalid card status transition from '${from}' to '${to}'.`);
    this.name = 'InvalidCardTransitionException';
    this.fromStatus = from;
    this.toStatus = to;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, InvalidCardTransitionException.prototype);
  }
}

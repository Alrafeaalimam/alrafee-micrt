// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/ConflictException.ts
// Domain Exception: Conflict / Resource Already Exists (Rule 14, Rule 19)
// ============================================================================

export class ConflictException extends Error {
  constructor(
    message: string,
    public readonly errorCode = 'CONFLICT'
  ) {
    super(message);
    this.name = 'ConflictException';
  }
}

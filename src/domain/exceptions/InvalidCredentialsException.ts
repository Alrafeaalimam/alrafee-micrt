// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/InvalidCredentialsException.ts
// Domain Exception: Authentication Failure (Rule 14)
// ============================================================================

export class InvalidCredentialsException extends Error {
  constructor(message = 'بيانات الدخول غير صحيحة') {
    super(message);
    this.name = 'InvalidCredentialsException';
  }
}

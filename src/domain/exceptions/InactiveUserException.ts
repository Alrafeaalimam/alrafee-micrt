// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/InactiveUserException.ts
// Domain Exception: Inactive / Suspended Account (Rule 14)
// ============================================================================

export class InactiveUserException extends Error {
  constructor(message = 'الحساب معطل، يرجى التواصل مع مسؤول النظام') {
    super(message);
    this.name = 'InactiveUserException';
  }
}

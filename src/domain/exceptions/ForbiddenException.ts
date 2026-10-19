// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/ForbiddenException.ts
// Domain Exception: Role-Based Authorization Failure (Rule 14)
// ============================================================================

export class ForbiddenException extends Error {
  constructor(message = 'ليس لديك صلاحية لتنفيذ هذا الإجراء') {
    super(message);
    this.name = 'ForbiddenException';
  }
}

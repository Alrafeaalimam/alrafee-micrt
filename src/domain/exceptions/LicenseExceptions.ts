// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/LicenseExceptions.ts
// Domain Exceptions: Licensing & Subscription Validation Failures
// ============================================================================

export class LicenseCodeNotFoundException extends Error {
  readonly code = 'CODE_NOT_FOUND';
  constructor(message = 'كود الترخيص غير موجود أو غير صالح') {
    super(message);
    this.name = 'LicenseCodeNotFoundException';
  }
}

export class LicenseCodeAlreadyUsedException extends Error {
  readonly code = 'CODE_ALREADY_USED';
  constructor(message = 'كود الترخيص تم استخدامه مسبقاً') {
    super(message);
    this.name = 'LicenseCodeAlreadyUsedException';
  }
}

export class LicenseCodeRevokedException extends Error {
  readonly code = 'CODE_REVOKED';
  constructor(message = 'كود الترخيص ملغي ولا يمكن استخدامه') {
    super(message);
    this.name = 'LicenseCodeRevokedException';
  }
}

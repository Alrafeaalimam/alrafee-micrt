// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/OtpExceptions.ts
// Domain Exception: Invalid or Expired Password Reset OTP
// ============================================================================

export class InvalidOtpException extends Error {
  readonly code = 'INVALID_OR_EXPIRED_OTP';

  constructor(message = 'كود التحقق غير صحيح أو انتهت صلاحيته') {
    super(message);
    this.name = 'InvalidOtpException';
  }
}

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/TrialCardGenerationLockedException.ts
// Domain Exception: Trial Mode Card Generation Locked (Rule 14 / Phase 14)
// ============================================================================

export class TrialCardGenerationLockedException extends Error {
  public readonly code = 'TRIAL_CARD_GENERATION_LOCKED';

  constructor(
    message = 'يمكنك استخدام وظائف Jalsah خلال الفترة التجريبية. لتوليد كروت الإنترنت، يرجى الاشتراك في إحدى الباقات أو طلب تفعيل حسابك من الإدارة.'
  ) {
    super(message);
    this.name = 'TrialCardGenerationLockedException';
    Object.setPrototypeOf(this, TrialCardGenerationLockedException.prototype);
  }
}

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/domain/exceptions/PendingApprovalException.ts
// Domain Exception: Tenant Pending Administrative Approval (Rule 14, Phase 2)
// ============================================================================

export class PendingApprovalException extends Error {
  readonly code = 'ACCOUNT_PENDING_APPROVAL';
  readonly errorCode = 'ACCOUNT_PENDING_APPROVAL';

  constructor(message = 'حسابك قيد المراجعة من الإدارة') {
    super(message);
    this.name = 'PendingApprovalException';
  }
}

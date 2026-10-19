// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/interfaces/IAuditLogger.ts
// Abstract Interface: Audit Logging Contract (Rule 16, Rule 22)
// ============================================================================

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'CONNECT'
  | 'DISCONNECT'
  | 'PROVISION_USER'
  | 'REVOKE_USER'
  | 'DISCONNECT_SESSION'
  | 'GENERATE_BATCH'
  | 'SELL_CARDS'
  | 'ROUTER_BACKUP'
  | 'CONFIG_CHANGE'
  | string;

export type AuditResultType = 'SUCCESS' | 'FAILURE' | 'WARNING';

export interface IAuditLogger {
  log(
    tenantId: string,
    userId: string | null,
    action: AuditActionType,
    entityType: string,
    entityId: string | null,
    description: string,
    result?: AuditResultType
  ): Promise<void>;
}

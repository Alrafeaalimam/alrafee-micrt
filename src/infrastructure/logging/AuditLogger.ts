// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/logging/AuditLogger.ts
// Infrastructure Service: Prisma-backed Security & Mutation Audit Logger (Rule 16, Rule 22)
// ============================================================================

import { prisma } from '../database/prisma.js';
import {
  IAuditLogger,
  AuditActionType,
  AuditResultType,
} from '../../application/interfaces/IAuditLogger.js';

export class AuditLogger implements IAuditLogger {
  /**
   * Records an immutable entry in the system audit log.
   */
  async log(
    tenantId: string,
    userId: string | null,
    action: AuditActionType,
    entityType: string,
    entityId: string | null,
    description: string,
    result: AuditResultType = 'SUCCESS'
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: userId ?? null,
          action: action as any,
          entityType,
          entityId: entityId ?? null,
          description,
          result: (result || 'SUCCESS') as any,
        },
      });
    } catch (error) {
      console.error('[AuditLogger] Failed to write audit log entry:', error);
    }
  }

  /**
   * Static helper allowing direct AuditLogger.log(...) invocations.
   */
  static async log(
    tenantId: string,
    userId: string | null,
    action: AuditActionType,
    entityType: string,
    entityId: string | null,
    description: string,
    result: AuditResultType = 'SUCCESS'
  ): Promise<void> {
    return defaultAuditLogger.log(
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      description,
      result
    );
  }
}

export const defaultAuditLogger = new AuditLogger();

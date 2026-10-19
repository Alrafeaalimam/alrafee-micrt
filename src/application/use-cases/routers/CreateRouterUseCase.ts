// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/routers/CreateRouterUseCase.ts
// Application Use Case: Create and Provision New Router Entity (Rule 16)
// ============================================================================

import {
  IRouterRepository,
  Router,
  CreateRouterData,
} from '../../interfaces/IRouterRepository.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export type CreateRouterInput = CreateRouterData & {
  userId?: string | null;
};

export class CreateRouterUseCase {
  constructor(
    private readonly routerRepository: IRouterRepository,
    private readonly auditLogger?: IAuditLogger,
    private readonly prisma: PrismaClient = defaultPrisma
  ) {}

  async execute(input: CreateRouterInput): Promise<Router> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Router name cannot be empty');
    }
    if (!input.host || input.host.trim().length === 0) {
      throw new Error('Router host cannot be empty');
    }
    if (!input.username || input.username.trim().length === 0) {
      throw new Error('Router username cannot be empty');
    }
    if (!input.password || input.password.length === 0) {
      throw new Error('Router password cannot be empty');
    }

    // Check maxRoutersLimit for tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      include: {
        _count: {
          select: { routers: true },
        },
      },
    });

    if (tenant && tenant._count.routers >= tenant.maxRoutersLimit) {
      const err: any = new Error('وصلت للحد الأقصى من الراوترات المسموح به في خطتك الحالية');
      err.code = 'MAX_ROUTERS_LIMIT_EXCEEDED';
      err.statusCode = 403;
      throw err;
    }

    const router = await this.routerRepository.create(input);

    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.userId ?? null,
        'CREATE',
        'Router',
        router.id,
        `Created router "${router.name}" (${router.host})`,
        'SUCCESS'
      );
    }

    return router;
  }
}

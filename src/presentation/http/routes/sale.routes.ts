// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/sale.routes.ts
// Presentation Route: Sale & Sales Total Endpoints (Rule 8, Rule 16, Rule 19)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  createSaleSchema,
  listSalesQuerySchema,
} from '../../validators/sale.validator.js';
import { CreateSaleUseCase } from '../../../application/use-cases/sales/CreateSaleUseCase.js';
import { GetTodaySalesUseCase } from '../../../application/use-cases/sales/GetTodaySalesUseCase.js';
import { ListSalesUseCase } from '../../../application/use-cases/sales/ListSalesUseCase.js';
import { PrismaSaleRepository } from '../../../infrastructure/database/repositories/PrismaSaleRepository.js';
import { PrismaCardRepository } from '../../../infrastructure/database/repositories/PrismaCardRepository.js';
import { AuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { InvalidCardTransitionException } from '../../../domain/exceptions/InvalidCardTransitionException.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { subscriptionMiddleware } from '../middlewares/subscriptionMiddleware.js';

export const saleRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Apply JWT authentication and subscription preHandler hooks to all sale endpoints
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionMiddleware);

  // Dependency Injection Composition Root
  const saleRepository = new PrismaSaleRepository();
  const cardRepository = new PrismaCardRepository();
  const auditLogger = new AuditLogger();

  const createSaleUseCase = new CreateSaleUseCase(
    saleRepository,
    cardRepository,
    auditLogger
  );
  const getTodaySalesUseCase = new GetTodaySalesUseCase(saleRepository);
  const listSalesUseCase = new ListSalesUseCase(saleRepository);

  // --------------------------------------------------------------------------
  // 1. GET /api/v1/sales/today-total
  // --------------------------------------------------------------------------
  fastify.get('/today-total', async (request, reply) => {
    try {
      const { tenantId } = request.user!;

      const result = await getTodaySalesUseCase.execute({
        tenantId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to get today sales total');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to get today sales total',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 2. POST /api/v1/sales (Record Sale Transaction)
  // --------------------------------------------------------------------------
  fastify.post('/', async (request, reply) => {
    const parseResult = createSaleSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid request payload',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { tenantId, userId } = request.user!;

      const sale = await createSaleUseCase.execute({
        tenantId,
        soldById: userId,
        cardIds: parseResult.data.cardIds,
        paymentMethod: parseResult.data.paymentMethod,
      });

      return reply.status(201).send({
        success: true,
        data: sale,
      });
    } catch (err: any) {
      if (
        err instanceof InvalidCardTransitionException ||
        err.name === 'InvalidCardTransitionException' ||
        err.message?.includes('not AVAILABLE') ||
        err.message?.includes('Cannot complete sale')
      ) {
        return reply.status(422).send({
          success: false,
          errorCode: 'CARD_NOT_AVAILABLE',
          errorMessage: err.message,
        });
      }

      if (err.message?.includes('not found')) {
        return reply.status(404).send({
          success: false,
          errorCode: 'CARD_NOT_FOUND',
          errorMessage: err.message,
        });
      }

      if (
        err.code === 'P2002' ||
        err.message?.includes('Unique constraint') ||
        err.message?.includes('already exists')
      ) {
        return reply.status(409).send({
          success: false,
          errorCode: 'CARD_ALREADY_SOLD',
          errorMessage: 'One or more cards have already been sold in another transaction',
        });
      }

      fastify.log.error(err, 'Failed to record sale transaction');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to record sale transaction',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 3. GET /api/v1/sales (List Sales Transactions)
  // --------------------------------------------------------------------------
  fastify.get('/', async (request, reply) => {
    const queryResult = listSalesQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid query parameters',
        details: queryResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { tenantId } = request.user!;

      const sales = await listSalesUseCase.execute({
        tenantId,
        dateFrom: queryResult.data.dateFrom,
        dateTo: queryResult.data.dateTo,
      });

      return reply.status(200).send({
        success: true,
        data: sales,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to list sales');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to list sales',
      });
    }
  });
};

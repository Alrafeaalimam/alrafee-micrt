// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/card.routes.ts
// Presentation Route: Card & Card Batch Endpoints (Rule 9, Rule 16, Rule 19)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  generateBatchSchema,
  updateStatusSchema,
  listCardsQuerySchema,
  cardIdParamsSchema,
} from '../../validators/card.validator.js';
import { GenerateCardBatchUseCase } from '../../../application/use-cases/cards/GenerateCardBatchUseCase.js';
import { ListCardsUseCase } from '../../../application/use-cases/cards/ListCardsUseCase.js';
import { UpdateCardStatusUseCase } from '../../../application/use-cases/cards/UpdateCardStatusUseCase.js';
import { PrismaCardRepository } from '../../../infrastructure/database/repositories/PrismaCardRepository.js';
import { PrismaCardBatchRepository } from '../../../infrastructure/database/repositories/PrismaCardBatchRepository.js';
import { PrismaPackageRepository } from '../../../infrastructure/database/repositories/PrismaPackageRepository.js';
import { AuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { InvalidCardTransitionException } from '../../../domain/exceptions/InvalidCardTransitionException.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { subscriptionMiddleware } from '../middlewares/subscriptionMiddleware.js';

export const cardRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Apply JWT authentication and subscription preHandler hooks to all card endpoints
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionMiddleware);

  // Dependency Injection Composition Root
  const packageRepository = new PrismaPackageRepository();
  const cardBatchRepository = new PrismaCardBatchRepository();
  const cardRepository = new PrismaCardRepository();
  const auditLogger = new AuditLogger();

  const generateCardBatchUseCase = new GenerateCardBatchUseCase(
    cardBatchRepository,
    cardRepository,
    packageRepository,
    auditLogger
  );
  const listCardsUseCase = new ListCardsUseCase(cardRepository);
  const updateCardStatusUseCase = new UpdateCardStatusUseCase(
    cardRepository,
    auditLogger
  );

  // --------------------------------------------------------------------------
  // 1. POST /api/v1/cards/generate-batch
  // --------------------------------------------------------------------------
  fastify.post('/generate-batch', async (request, reply) => {
    const parseResult = generateBatchSchema.safeParse(request.body);

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

      const result = await generateCardBatchUseCase.execute({
        tenantId,
        createdById: userId,
        ...parseResult.data,
      });

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return reply.status(404).send({
          success: false,
          errorCode: 'PACKAGE_NOT_FOUND',
          errorMessage: err.message,
        });
      }

      if (err.message?.includes('inactive')) {
        return reply.status(422).send({
          success: false,
          errorCode: 'PACKAGE_INACTIVE',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Failed to generate card batch');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to generate card batch',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 2. GET /api/v1/cards (with optional query params: status, batchId)
  // --------------------------------------------------------------------------
  fastify.get('/', async (request, reply) => {
    const queryResult = listCardsQuerySchema.safeParse(request.query);

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

      const cards = await listCardsUseCase.execute({
        tenantId,
        status: queryResult.data.status,
        batchId: queryResult.data.batchId,
      });

      return reply.status(200).send({
        success: true,
        data: cards,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to list cards');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to list cards',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 3. PATCH /api/v1/cards/:id/status
  // --------------------------------------------------------------------------
  fastify.patch('/:id/status', async (request, reply) => {
    const paramsResult = cardIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid card ID parameter',
        details: paramsResult.error.flatten().fieldErrors,
      });
    }

    const bodyResult = updateStatusSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid request payload',
        details: bodyResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { tenantId, userId } = request.user!;

      const updatedCard = await updateCardStatusUseCase.execute({
        cardId: paramsResult.data.id,
        tenantId,
        newStatus: bodyResult.data.newStatus,
        userId,
      });

      return reply.status(200).send({
        success: true,
        data: updatedCard,
      });
    } catch (err: any) {
      if (
        err instanceof InvalidCardTransitionException ||
        err.name === 'InvalidCardTransitionException'
      ) {
        return reply.status(422).send({
          success: false,
          errorCode: 'INVALID_CARD_TRANSITION',
          errorMessage: err.message,
          fromStatus: err.fromStatus,
          toStatus: err.toStatus,
        });
      }

      if (err.message?.includes('not found')) {
        return reply.status(404).send({
          success: false,
          errorCode: 'CARD_NOT_FOUND',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Failed to update card status');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to update card status',
      });
    }
  });
};

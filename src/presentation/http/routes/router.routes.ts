// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/router.routes.ts
// Presentation Route: Router Diagnostic & CRUD Endpoints (Rule 16, Rule 19)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  testRouterConnectionSchema,
  createRouterSchema,
  updateRouterSchema,
  routerIdParamsSchema,
} from '../../validators/router.validator.js';
import { TestRouterConnectionUseCase } from '../../../application/use-cases/routers/TestRouterConnectionUseCase.js';
import { CreateRouterUseCase } from '../../../application/use-cases/routers/CreateRouterUseCase.js';
import { ListRoutersUseCase } from '../../../application/use-cases/routers/ListRoutersUseCase.js';
import { UpdateRouterUseCase } from '../../../application/use-cases/routers/UpdateRouterUseCase.js';
import { DeleteRouterUseCase } from '../../../application/use-cases/routers/DeleteRouterUseCase.js';
import { MockRouterConnector } from '../../../infrastructure/mikrotik/adapters/MockRouterConnector.js';
import { PrismaRouterRepository } from '../../../infrastructure/database/repositories/PrismaRouterRepository.js';
import { AuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { subscriptionMiddleware } from '../middlewares/subscriptionMiddleware.js';

export const routerRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  // Apply JWT authentication and subscription preHandler hooks to all router endpoints
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionMiddleware);

  // Dependency Injection Composition Root
  const routerConnector = new MockRouterConnector();
  const testConnectionUseCase = new TestRouterConnectionUseCase(routerConnector);

  const routerRepository = new PrismaRouterRepository();
  const auditLogger = new AuditLogger();
  const createRouterUseCase = new CreateRouterUseCase(routerRepository, auditLogger);
  const listRoutersUseCase = new ListRoutersUseCase(routerRepository);
  const updateRouterUseCase = new UpdateRouterUseCase(routerRepository, auditLogger);
  const deleteRouterUseCase = new DeleteRouterUseCase(routerRepository, auditLogger);

  // --------------------------------------------------------------------------
  // 1. POST /api/v1/routers/test-connection (Diagnostic Probe)
  // --------------------------------------------------------------------------
  fastify.post('/test-connection', async (request, reply) => {
    const parseResult = testRouterConnectionSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid request payload',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const result = await testConnectionUseCase.execute(parseResult.data);

    if (result.success) {
      return reply.status(200).send({
        success: true,
        data: result.data,
      });
    } else {
      return reply.status(422).send({
        success: false,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }
  });

  // --------------------------------------------------------------------------
  // 2. POST /api/v1/routers (Create Router)
  // --------------------------------------------------------------------------
  fastify.post('/', async (request, reply) => {
    const parseResult = createRouterSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid request payload',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { port, ...rest } = parseResult.data;
      const { tenantId, userId } = request.user!;

      const router = await createRouterUseCase.execute({
        tenantId,
        userId,
        apiPort: port,
        ...rest,
      });

      return reply.status(201).send({
        success: true,
        data: router,
      });
    } catch (err: any) {
      if (err.statusCode === 403 || err.code === 'MAX_ROUTERS_LIMIT_EXCEEDED') {
        return reply.status(403).send({
          success: false,
          errorCode: 'MAX_ROUTERS_LIMIT_EXCEEDED',
          errorMessage: err.message || 'وصلت للحد الأقصى من الراوترات المسموح به في خطتك الحالية',
        });
      }

      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        return reply.status(409).send({
          success: false,
          errorCode: 'ROUTER_NAME_EXISTS',
          errorMessage: 'A router with this name already exists for this tenant',
        });
      }

      fastify.log.error(err, 'Failed to create router');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to create router',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 3. GET /api/v1/routers (List Routers)
  // --------------------------------------------------------------------------
  fastify.get('/', async (request, reply) => {
    try {
      const { tenantId } = request.user!;
      const routers = await listRoutersUseCase.execute({
        tenantId,
      });

      return reply.status(200).send({
        success: true,
        data: routers,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to list routers');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to list routers',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 4. PATCH /api/v1/routers/:id (Update Router)
  // --------------------------------------------------------------------------
  fastify.patch('/:id', async (request, reply) => {
    const paramsResult = routerIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid router ID parameter',
        details: paramsResult.error.flatten().fieldErrors,
      });
    }

    const bodyResult = updateRouterSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid request payload',
        details: bodyResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { port, ...rest } = bodyResult.data;
      const { tenantId, userId } = request.user!;

      const updated = await updateRouterUseCase.execute({
        id: paramsResult.data.id,
        tenantId,
        userId,
        ...(port !== undefined ? { apiPort: port } : {}),
        ...rest,
      });

      return reply.status(200).send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return reply.status(404).send({
          success: false,
          errorCode: 'ROUTER_NOT_FOUND',
          errorMessage: err.message,
        });
      }

      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        return reply.status(409).send({
          success: false,
          errorCode: 'ROUTER_NAME_EXISTS',
          errorMessage: 'A router with this name already exists for this tenant',
        });
      }

      fastify.log.error(err, 'Failed to update router');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to update router',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 5. DELETE /api/v1/routers/:id (Delete Router)
  // --------------------------------------------------------------------------
  fastify.delete('/:id', async (request, reply) => {
    const paramsResult = routerIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid router ID parameter',
        details: paramsResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { tenantId, userId } = request.user!;

      await deleteRouterUseCase.execute({
        id: paramsResult.data.id,
        tenantId,
        userId,
      });

      return reply.status(200).send({
        success: true,
        message: 'Router deleted successfully',
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return reply.status(404).send({
          success: false,
          errorCode: 'ROUTER_NOT_FOUND',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Failed to delete router');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to delete router',
      });
    }
  });
};

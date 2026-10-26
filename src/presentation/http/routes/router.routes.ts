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
import { RealRouterConnector } from '../../../infrastructure/mikrotik/adapters/RealRouterConnector.js';
import { MockRouterConnector } from '../../../infrastructure/mikrotik/adapters/MockRouterConnector.js';
import { RouterRateLimiter } from '../../../infrastructure/security/RouterRateLimiter.js';
import { PrismaRouterRepository } from '../../../infrastructure/database/repositories/PrismaRouterRepository.js';
import { AuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { subscriptionMiddleware } from '../middlewares/subscriptionMiddleware.js';

export const routerRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  // Apply JWT authentication and subscription preHandler hooks to all router endpoints
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionMiddleware);

  // Dependency Injection Composition Root - Using Real or Mock Connector according to configuration
  const routerConnector = process.env.USE_MOCK_ROUTER === 'true'
    ? new MockRouterConnector()
    : new RealRouterConnector();
  const testConnectionUseCase = new TestRouterConnectionUseCase(routerConnector);
  const routerRateLimiter = new RouterRateLimiter();

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
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const detailsStr = Object.entries(fieldErrors)
        .map(([k, v]) => `${k}: ${v?.join(', ')}`)
        .join(' | ');
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: detailsStr ? `بيانات فحص الراوتر غير صالحة (${detailsStr})` : 'بيانات فحص الراوتر غير صالحة',
        details: fieldErrors,
      });
    }

    const { tenantId } = request.user!;

    // 1. Process-level rate and concurrency limit
    const rateCheck = routerRateLimiter.acquire(tenantId);
    if (!rateCheck.allowed) {
      reply.header('Retry-After', String(rateCheck.retryAfterSeconds || 60));
      return reply.status(429).send({
        success: false,
        errorCode: 'TOO_MANY_REQUESTS',
        errorMessage: rateCheck.reason || 'تم تجاوز الحد المسموح به من طلبات فحص الراوتر. يرجى الانتظار قليلاً.',
      });
    }

    // 2. Client disconnection & cancellation tracking
    const abortController = new AbortController();
    let isClientAborted = false;

    const onClientClose = () => {
      if (!reply.raw.writableEnded) {
        isClientAborted = true;
        abortController.abort(new Error('CLIENT_CLOSED_REQUEST'));
      }
    };
    request.raw.on('close', onClientClose);

    try {
      const result = await testConnectionUseCase.execute(
        parseResult.data as any,
        10000,
        abortController.signal
      );

      if (isClientAborted || (!result.success && result.errorCode === 'CLIENT_ABORTED')) {
        if (!reply.raw.writableEnded) {
          return reply.status(400).send({
            success: false,
            errorCode: 'CLIENT_ABORTED',
            errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
          });
        }
        return;
      }

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
    } finally {
      request.raw.off('close', onClientClose);
      routerRateLimiter.release(tenantId);
    }
  });

  // --------------------------------------------------------------------------
  // 1b. POST /api/v1/routers/:id/test-connection (Diagnostic Probe for Stored Router)
  // --------------------------------------------------------------------------
  fastify.post('/:id/test-connection', async (request, reply) => {
    const paramsResult = routerIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid router ID parameter',
        details: paramsResult.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.user!;

    // 1. Process-level rate and concurrency limit
    const rateCheck = routerRateLimiter.acquire(tenantId);
    if (!rateCheck.allowed) {
      reply.header('Retry-After', String(rateCheck.retryAfterSeconds || 60));
      return reply.status(429).send({
        success: false,
        errorCode: 'TOO_MANY_REQUESTS',
        errorMessage: rateCheck.reason || 'تم تجاوز الحد المسموح به من طلبات فحص الراوتر. يرجى الانتظار قليلاً.',
      });
    }

    // 2. Client disconnection & cancellation tracking
    const abortController = new AbortController();
    let isClientAborted = false;

    const onClientClose = () => {
      if (!reply.raw.writableEnded) {
        isClientAborted = true;
        abortController.abort(new Error('CLIENT_CLOSED_REQUEST'));
      }
    };
    request.raw.on('close', onClientClose);

    try {
      const creds = await routerRepository.getDecryptedCredentials(paramsResult.data.id, tenantId);

      if (!creds) {
        return reply.status(404).send({
          success: false,
          errorCode: 'ROUTER_NOT_FOUND',
          errorMessage: 'الراوتر المطلوب غير موجود أو لا تملك صلاحية الوصول إليه ضمن حسابك',
        });
      }

      const result = await testConnectionUseCase.execute(
        {
          host: creds.host,
          port: creds.apiPort,
          username: creds.username,
          password: creds.password,
          connectionMethod: creds.connectionMethod as any,
        },
        10000,
        abortController.signal
      );

      if (isClientAborted || (!result.success && result.errorCode === 'CLIENT_ABORTED')) {
        if (!reply.raw.writableEnded) {
          return reply.status(400).send({
            success: false,
            errorCode: 'CLIENT_ABORTED',
            errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
          });
        }
        return;
      }

      if (result.success) {
        const healthData: any = {
          routerOsVersion: result.data.version,
          boardModel: result.data.boardName,
          cpuLoadPercentage: result.data.cpuLoad,
          uptimeSeconds: BigInt(result.data.uptimeSeconds),
        };
        if (result.data.freeMemoryBytes !== undefined) {
          healthData.freeMemoryBytes = BigInt(result.data.freeMemoryBytes);
        }
        if (result.data.totalMemoryBytes !== undefined) {
          healthData.totalMemoryBytes = BigInt(result.data.totalMemoryBytes);
        }

        await routerRepository.updateHealthStatus(paramsResult.data.id, tenantId, 'ONLINE', healthData);

        return reply.status(200).send({
          success: true,
          data: result.data,
        });
      } else {
        await routerRepository.updateHealthStatus(paramsResult.data.id, tenantId, 'ERROR', {
          errorMessage: result.errorMessage,
        });

        return reply.status(422).send({
          success: false,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
      }
    } finally {
      request.raw.off('close', onClientClose);
      routerRateLimiter.release(tenantId);
    }
  });

  // --------------------------------------------------------------------------
  // 2. POST /api/v1/routers (Create Router)
  // --------------------------------------------------------------------------
  fastify.post('/', async (request, reply) => {
    const parseResult = createRouterSchema.safeParse(request.body);

    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const detailsStr = Object.entries(fieldErrors)
        .map(([k, v]) => `${k}: ${v?.join(', ')}`)
        .join(' | ');
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: detailsStr ? `بيانات فحص الراوتر غير صالحة (${detailsStr})` : 'بيانات فحص الراوتر غير صالحة',
        details: fieldErrors,
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
      const fieldErrors = bodyResult.error.flatten().fieldErrors;
      const detailsStr = Object.entries(fieldErrors)
        .map(([k, v]) => `${k}: ${v?.join(', ')}`)
        .join(' | ');
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: detailsStr ? `بيانات تعديل الراوتر غير صالحة (${detailsStr})` : 'بيانات تعديل الراوتر غير صالحة',
        details: fieldErrors,
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

  // --------------------------------------------------------------------------
  // 6. GET /api/v1/routers/:id/hotspot-users
  // --------------------------------------------------------------------------
  fastify.get('/:id/hotspot-users', async (request, reply) => {
    const paramsResult = routerIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid router ID parameter',
      });
    }

    const { tenantId } = request.user!;
    const creds = await routerRepository.getDecryptedCredentials(paramsResult.data.id, tenantId);

    if (!creds) {
      return reply.status(404).send({
        success: false,
        errorCode: 'ROUTER_NOT_FOUND',
        errorMessage: 'الراوتر المطلوب غير موجود أو لا تملك صلاحية الوصول إليه',
      });
    }

    const result = await routerConnector.getHotspotUsers({
      host: creds.host,
      port: creds.apiPort,
      username: creds.username,
      password: creds.password,
      connectionMethod: creds.connectionMethod as any,
    });

    if (!result.success) {
      return reply.status(422).send({
        success: false,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    // Correlate with database cards for this tenant and router
    const cards = await routerRepository['prisma'].card.findMany({
      where: {
        tenantId,
        routerId: paramsResult.data.id,
      },
      select: {
        id: true,
        username: true,
        status: true,
        price: true,
      },
    });

    const cardMap = new Map<string, any>(cards.map((c: any) => [c.username, c]));

    const correlated = result.data.map((u) => {
      const dbCard = cardMap.get(u.username);
      return {
        ...u,
        verifiedOnRouter: true,
        dbCardId: dbCard?.id || null,
        dbStatus: dbCard?.status || 'ROUTER_ONLY',
        price: dbCard ? Number(dbCard.price) : null,
      };
    });

    return reply.status(200).send({
      success: true,
      data: correlated,
    });
  });

  // --------------------------------------------------------------------------
  // 7. GET /api/v1/routers/:id/hotspot-sessions
  // --------------------------------------------------------------------------
  fastify.get('/:id/hotspot-sessions', async (request, reply) => {
    const paramsResult = routerIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid router ID parameter',
      });
    }

    const { tenantId } = request.user!;
    const creds = await routerRepository.getDecryptedCredentials(paramsResult.data.id, tenantId);

    if (!creds) {
      return reply.status(404).send({
        success: false,
        errorCode: 'ROUTER_NOT_FOUND',
        errorMessage: 'الراوتر المطلوب غير موجود أو لا تملك صلاحية الوصول إليه',
      });
    }

    const result = await routerConnector.getHotspotActiveSessions({
      host: creds.host,
      port: creds.apiPort,
      username: creds.username,
      password: creds.password,
      connectionMethod: creds.connectionMethod as any,
    });

    if (!result.success) {
      return reply.status(422).send({
        success: false,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    return reply.status(200).send({
      success: true,
      data: result.data,
    });
  });

  // --------------------------------------------------------------------------
  // 8. PATCH /api/v1/routers/:id/hotspot-users/:username
  // --------------------------------------------------------------------------
  fastify.patch('/:id/hotspot-users/:username', async (request, reply) => {
    const { id, username } = request.params as { id: string; username: string };
    const body = request.body as { isEnabled?: boolean };

    if (!id || !username || typeof body?.isEnabled !== 'boolean') {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'يرجى تحديد معرف الراوتر واسم المستخدم وحالة التفعيل (isEnabled)',
      });
    }

    const { tenantId, userId } = request.user!;
    const creds = await routerRepository.getDecryptedCredentials(id, tenantId);

    if (!creds) {
      return reply.status(404).send({
        success: false,
        errorCode: 'ROUTER_NOT_FOUND',
        errorMessage: 'الراوتر المطلوب غير موجود أو لا تملك صلاحية الوصول إليه',
      });
    }

    const credsInput = {
      host: creds.host,
      port: creds.apiPort,
      username: creds.username,
      password: creds.password,
      connectionMethod: creds.connectionMethod as any,
    };

    const result = body.isEnabled
      ? await routerConnector.enableHotspotUser(credsInput, username)
      : await routerConnector.disableHotspotUser(credsInput, username);

    if (!result.success) {
      return reply.status(422).send({
        success: false,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    await auditLogger.log(
      tenantId,
      userId,
      'UPDATE_ROUTER',
      'HotspotUser',
      username,
      `User "${username}" on router "${id}" set to isEnabled=${body.isEnabled}`,
      'SUCCESS'
    );

    return reply.status(200).send({
      success: true,
      message: `تم ${body.isEnabled ? 'تفعيل' : 'تعطيل'} المستخدم ${username} بنجاح`,
      data: {
        username,
        isEnabled: body.isEnabled,
      },
    });
  });

  // --------------------------------------------------------------------------
  // 9. POST /api/v1/routers/:id/hotspot-sessions/:username/disconnect
  // --------------------------------------------------------------------------
  fastify.post('/:id/hotspot-sessions/:username/disconnect', async (request, reply) => {
    const { id, username } = request.params as { id: string; username: string };

    if (!id || !username) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'يرجى تحديد معرف الراوتر واسم المستخدم لفصل جلسته',
      });
    }

    const { tenantId, userId } = request.user!;
    const creds = await routerRepository.getDecryptedCredentials(id, tenantId);

    if (!creds) {
      return reply.status(404).send({
        success: false,
        errorCode: 'ROUTER_NOT_FOUND',
        errorMessage: 'الراوتر المطلوب غير موجود أو لا تملك صلاحية الوصول إليه',
      });
    }

    const credsInput = {
      host: creds.host,
      port: creds.apiPort,
      username: creds.username,
      password: creds.password,
      connectionMethod: creds.connectionMethod as any,
    };

    const result = await routerConnector.disconnectActiveSession(credsInput, username);

    if (!result.success) {
      return reply.status(422).send({
        success: false,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    await auditLogger.log(
      tenantId,
      userId,
      'UPDATE_ROUTER',
      'HotspotSession',
      username,
      `Disconnected active session for user "${username}" on router "${id}"`,
      'SUCCESS'
    );

    return reply.status(200).send({
      success: true,
      message: `تم فصل جلسة المستخدم ${username} بنجاح`,
    });
  });
};

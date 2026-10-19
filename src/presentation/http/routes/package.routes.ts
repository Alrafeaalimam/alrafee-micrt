// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/package.routes.ts
// Presentation Route: Package CRUD Endpoints (Rule 16, Rule 19)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  createPackageSchema,
  updatePackageSchema,
  packageIdParamsSchema,
} from '../../validators/package.validator.js';
import { CreatePackageUseCase } from '../../../application/use-cases/packages/CreatePackageUseCase.js';
import { ListPackagesUseCase } from '../../../application/use-cases/packages/ListPackagesUseCase.js';
import { UpdatePackageUseCase } from '../../../application/use-cases/packages/UpdatePackageUseCase.js';
import { DeletePackageUseCase } from '../../../application/use-cases/packages/DeletePackageUseCase.js';
import { PrismaPackageRepository } from '../../../infrastructure/database/repositories/PrismaPackageRepository.js';
import { AuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { subscriptionMiddleware } from '../middlewares/subscriptionMiddleware.js';

export const packageRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Apply JWT authentication and subscription preHandler hooks to all package endpoints
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionMiddleware);

  // Dependency Injection Composition Root
  const packageRepository = new PrismaPackageRepository();
  const auditLogger = new AuditLogger();
  const createPackageUseCase = new CreatePackageUseCase(packageRepository, auditLogger);
  const listPackagesUseCase = new ListPackagesUseCase(packageRepository);
  const updatePackageUseCase = new UpdatePackageUseCase(packageRepository, auditLogger);
  const deletePackageUseCase = new DeletePackageUseCase(packageRepository, auditLogger);

  // --------------------------------------------------------------------------
  // 1. POST /api/v1/packages (Create Package)
  // --------------------------------------------------------------------------
  fastify.post('/', async (request, reply) => {
    const parseResult = createPackageSchema.safeParse(request.body);

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

      const pkg = await createPackageUseCase.execute({
        tenantId,
        userId,
        ...parseResult.data,
      });

      return reply.status(201).send({
        success: true,
        data: pkg,
      });
    } catch (err: any) {
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        return reply.status(409).send({
          success: false,
          errorCode: 'PACKAGE_CODE_EXISTS',
          errorMessage: 'A package with this code already exists for this tenant',
        });
      }

      fastify.log.error(err, 'Failed to create package');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to create package',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 2. GET /api/v1/packages (List Packages)
  // --------------------------------------------------------------------------
  fastify.get('/', async (request, reply) => {
    try {
      const { tenantId } = request.user!;

      const packages = await listPackagesUseCase.execute({
        tenantId,
      });

      return reply.status(200).send({
        success: true,
        data: packages,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to list packages');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to list packages',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 3. PATCH /api/v1/packages/:id (Update Package)
  // --------------------------------------------------------------------------
  fastify.patch('/:id', async (request, reply) => {
    const paramsResult = packageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid package ID parameter',
        details: paramsResult.error.flatten().fieldErrors,
      });
    }

    const bodyResult = updatePackageSchema.safeParse(request.body);
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

      const updated = await updatePackageUseCase.execute({
        id: paramsResult.data.id,
        tenantId,
        userId,
        ...bodyResult.data,
      });

      return reply.status(200).send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return reply.status(404).send({
          success: false,
          errorCode: 'PACKAGE_NOT_FOUND',
          errorMessage: err.message,
        });
      }

      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        return reply.status(409).send({
          success: false,
          errorCode: 'PACKAGE_CODE_EXISTS',
          errorMessage: 'A package with this code already exists for this tenant',
        });
      }

      fastify.log.error(err, 'Failed to update package');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to update package',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 4. DELETE /api/v1/packages/:id (Delete Package)
  // --------------------------------------------------------------------------
  fastify.delete('/:id', async (request, reply) => {
    const paramsResult = packageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid package ID parameter',
        details: paramsResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { tenantId, userId } = request.user!;

      await deletePackageUseCase.execute({
        id: paramsResult.data.id,
        tenantId,
        userId,
      });

      return reply.status(200).send({
        success: true,
        message: 'Package deleted successfully',
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return reply.status(404).send({
          success: false,
          errorCode: 'PACKAGE_NOT_FOUND',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Failed to delete package');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to delete package',
      });
    }
  });
};

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/user.routes.ts
// Presentation Route: Staff & User Management Endpoints (Rule 14, Rule 19, Rule 26)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  createStaffUserSchema,
  deactivateUserParamsSchema,
} from '../../validators/user.validator.js';
import { CreateStaffUserUseCase } from '../../../application/use-cases/users/CreateStaffUserUseCase.js';
import { ListStaffUseCase } from '../../../application/use-cases/users/ListStaffUseCase.js';
import { DeactivateStaffUseCase } from '../../../application/use-cases/users/DeactivateStaffUseCase.js';
import { PrismaUserRepository } from '../../../infrastructure/database/repositories/PrismaUserRepository.js';
import { AuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { ForbiddenException } from '../../../domain/exceptions/ForbiddenException.js';

export const userRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // 1. Authenticate JWT on all user management routes
  fastify.addHook('preHandler', authMiddleware);

  // 2. Authorize role: only TENANT_ADMIN or SUPER_ADMIN
  fastify.addHook(
    'preHandler',
    requireRole(['TENANT_ADMIN', 'SUPER_ADMIN'])
  );

  // Dependency Injection Composition Root
  const userRepository = new PrismaUserRepository();
  const auditLogger = new AuditLogger();

  const createStaffUserUseCase = new CreateStaffUserUseCase(
    userRepository,
    auditLogger
  );
  const listStaffUseCase = new ListStaffUseCase(userRepository);
  const deactivateStaffUseCase = new DeactivateStaffUseCase(
    userRepository,
    auditLogger
  );

  // --------------------------------------------------------------------------
  // 1. POST /api/v1/users (Create new staff member)
  // --------------------------------------------------------------------------
  fastify.post('/', async (request, reply) => {
    const parseResult = createStaffUserSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'بيانات الموظف المدخلة غير صالحة',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { userId, tenantId, role } = request.user!;

      const user = await createStaffUserUseCase.execute({
        callerId: userId,
        callerRole: role,
        tenantId,
        username: parseResult.data.username,
        password: parseResult.data.password,
        fullName: parseResult.data.fullName,
        role: parseResult.data.role,
        email: parseResult.data.email ?? null,
        phone: parseResult.data.phone ?? null,
      });

      return reply.status(201).send({
        success: true,
        data: user,
      });
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.name === 'ForbiddenException') {
        return reply.status(403).send({
          success: false,
          errorCode: 'FORBIDDEN',
          errorMessage: err.message,
        });
      }

      if (
        err.code === 'USERNAME_EXISTS' ||
        err.code === 'P2002' ||
        err.message?.includes('مسجل مسبقاً') ||
        err.message?.includes('Unique constraint')
      ) {
        return reply.status(409).send({
          success: false,
          errorCode: 'USERNAME_EXISTS',
          errorMessage: 'اسم المستخدم مسجل مسبقاً في هذه الشبكة',
        });
      }

      fastify.log.error(err, 'Failed to create staff user');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'فشل إضافة الموظف الجديد',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 2. GET /api/v1/users (List staff users for tenant)
  // --------------------------------------------------------------------------
  fastify.get('/', async (request, reply) => {
    try {
      const { userId, tenantId, role } = request.user!;

      const users = await listStaffUseCase.execute({
        callerId: userId,
        callerRole: role,
        tenantId,
      });

      return reply.status(200).send({
        success: true,
        data: users,
      });
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.name === 'ForbiddenException') {
        return reply.status(403).send({
          success: false,
          errorCode: 'FORBIDDEN',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Failed to list staff users');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'فشل جلب قائمة الموظفين',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 3. PATCH /api/v1/users/:id/deactivate (Deactivate staff user)
  // --------------------------------------------------------------------------
  fastify.patch('/:id/deactivate', async (request, reply) => {
    const paramsResult = deactivateUserParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'معرف المستخدم غير صالح (UUID required)',
        details: paramsResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { userId, tenantId, role } = request.user!;

      const user = await deactivateStaffUseCase.execute({
        callerId: userId,
        callerRole: role,
        tenantId,
        targetUserId: paramsResult.data.id,
      });

      return reply.status(200).send({
        success: true,
        data: user,
        message: 'تم تعطيل حساب الموظف بنجاح',
      });
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.name === 'ForbiddenException') {
        return reply.status(403).send({
          success: false,
          errorCode: 'FORBIDDEN',
          errorMessage: err.message,
        });
      }

      if (err.code === 'CANNOT_DEACTIVATE_SELF') {
        return reply.status(400).send({
          success: false,
          errorCode: 'CANNOT_DEACTIVATE_SELF',
          errorMessage: err.message,
        });
      }

      if (err.code === 'USER_NOT_FOUND' || err.message?.includes('غير موجود')) {
        return reply.status(404).send({
          success: false,
          errorCode: 'USER_NOT_FOUND',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Failed to deactivate staff user');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'فشل تعطيل حساب الموظف',
      });
    }
  });
};

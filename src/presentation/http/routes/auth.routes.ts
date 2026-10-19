// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/auth.routes.ts
// Presentation Route: Authentication Endpoints (Rule 14, Rule 19)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, verifyDeviceOtpSchema } from '../../validators/auth.validator.js';
import { registerSchema } from '../../validators/register.validator.js';
import { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase.js';
import { VerifyDeviceOtpUseCase } from '../../../application/use-cases/auth/VerifyDeviceOtpUseCase.js';
import { RegisterTenantUseCase } from '../../../application/use-cases/auth/RegisterTenantUseCase.js';
import { RequestPasswordResetUseCase } from '../../../application/use-cases/auth/RequestPasswordResetUseCase.js';
import { ResetPasswordWithOtpUseCase } from '../../../application/use-cases/auth/ResetPasswordWithOtpUseCase.js';
import { PrismaUserRepository } from '../../../infrastructure/database/repositories/PrismaUserRepository.js';
import { AuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { InvalidCredentialsException } from '../../../domain/exceptions/InvalidCredentialsException.js';
import { InactiveUserException } from '../../../domain/exceptions/InactiveUserException.js';
import { PendingApprovalException } from '../../../domain/exceptions/PendingApprovalException.js';
import { ConflictException } from '../../../domain/exceptions/ConflictException.js';
import { InvalidOtpException } from '../../../domain/exceptions/OtpExceptions.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { prisma } from '../../../infrastructure/database/prisma.js';

export const authRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  const userRepository = new PrismaUserRepository();
  const auditLogger = new AuditLogger();
  const loginUseCase = new LoginUseCase(userRepository, auditLogger);
  const verifyDeviceOtpUseCase = new VerifyDeviceOtpUseCase(undefined, auditLogger);
  const registerTenantUseCase = new RegisterTenantUseCase(undefined, auditLogger);
  const requestPasswordResetUseCase = new RequestPasswordResetUseCase();
  const resetPasswordWithOtpUseCase = new ResetPasswordWithOtpUseCase(undefined, auditLogger);

  // --------------------------------------------------------------------------
  // POST /api/v1/auth/login
  // --------------------------------------------------------------------------
  fastify.post('/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'بيانات تسجيل الدخول غير صالحة',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const identifier = parseResult.data.identifier || parseResult.data.username || '';
      const result = await loginUseCase.execute({
        identifier,
        username: identifier,
        password: parseResult.data.password,
        deviceFingerprint: parseResult.data.deviceFingerprint,
        deviceLabel: parseResult.data.deviceLabel,
        ip: request.ip,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (
        err instanceof PendingApprovalException ||
        err.name === 'PendingApprovalException' ||
        err.code === 'ACCOUNT_PENDING_APPROVAL' ||
        err.errorCode === 'ACCOUNT_PENDING_APPROVAL'
      ) {
        return reply.status(403).send({
          success: false,
          errorCode: 'ACCOUNT_PENDING_APPROVAL',
          errorMessage: err.message,
        });
      }

      if (err instanceof InactiveUserException || err.name === 'InactiveUserException') {
        return reply.status(403).send({
          success: false,
          errorCode: 'ACCOUNT_INACTIVE',
          errorMessage: err.message,
        });
      }

      if (err instanceof InvalidCredentialsException) {
        return reply.status(401).send({
          success: false,
          errorCode: 'INVALID_CREDENTIALS',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Unexpected login error');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'حدث خطأ داخلي أثناء تسجيل الدخول',
      });
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/auth/register
  // Public self-registration for new network/tenant & initial TENANT_ADMIN user
  // --------------------------------------------------------------------------
  fastify.post('/register', async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'بيانات التسجيل غير صالحة',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await registerTenantUseCase.execute({
        networkName: parseResult.data.networkName,
        adminFullName: parseResult.data.adminFullName,
        username: parseResult.data.username,
        email: parseResult.data.email,
        password: parseResult.data.password,
        phone: parseResult.data.phone,
        ip: request.ip,
      });

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err instanceof ConflictException || err.name === 'ConflictException') {
        return reply.status(409).send({
          success: false,
          errorCode: err.errorCode || 'CONFLICT',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Unexpected registration error');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'حدث خطأ داخلي أثناء تسجيل الحساب',
      });
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/auth/forgot-password
  // Request Password Reset OTP via Email
  // --------------------------------------------------------------------------
  fastify.post('/forgot-password', async (request, reply) => {
    const parseResult = forgotPasswordSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'البريد الإلكتروني غير صالح',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await requestPasswordResetUseCase.execute({
        email: parseResult.data.email,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Unexpected forgot-password error');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'حدث خطأ أثناء معالجة طلب استعادة كلمة المرور',
      });
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/auth/reset-password
  // Verify OTP and reset password
  // --------------------------------------------------------------------------
  fastify.post('/reset-password', async (request, reply) => {
    const parseResult = resetPasswordSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'بيانات إعادة تعيين كلمة المرور غير صالحة',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await resetPasswordWithOtpUseCase.execute({
        email: parseResult.data.email,
        otpCode: parseResult.data.otpCode,
        newPassword: parseResult.data.newPassword,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err instanceof InvalidOtpException || err.code === 'INVALID_OR_EXPIRED_OTP') {
        return reply.status(400).send({
          success: false,
          errorCode: 'INVALID_OR_EXPIRED_OTP',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Unexpected reset-password error');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'حدث خطأ أثناء إعادة تعيين كلمة المرور',
      });
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/auth/verify-device-otp
  // Verify OTP for new device login, register TrustedDevice, and issue JWT
  // --------------------------------------------------------------------------
  fastify.post('/verify-device-otp', async (request, reply) => {
    const parseResult = verifyDeviceOtpSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'بيانات تأكيد الجهاز غير صالحة',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await verifyDeviceOtpUseCase.execute({
        tempToken: parseResult.data.tempToken,
        otpCode: parseResult.data.otpCode,
        deviceFingerprint: parseResult.data.deviceFingerprint,
        deviceLabel: parseResult.data.deviceLabel,
        ip: request.ip,
        userAgent: (request.headers['user-agent'] as string) || undefined,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err instanceof InvalidOtpException || err.code === 'INVALID_OR_EXPIRED_OTP') {
        return reply.status(400).send({
          success: false,
          errorCode: 'INVALID_OR_EXPIRED_OTP',
          errorMessage: err.message,
        });
      }

      if (err instanceof InactiveUserException || err.name === 'InactiveUserException') {
        return reply.status(403).send({
          success: false,
          errorCode: 'ACCOUNT_INACTIVE',
          errorMessage: err.message,
        });
      }

      fastify.log.error(err, 'Unexpected verify-device-otp error');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'حدث خطأ أثناء تأكيد الجهاز',
      });
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/v1/auth/me
  // Get current authenticated user profile
  // --------------------------------------------------------------------------
  fastify.get('/me', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const { userId } = request.user!;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { tenant: { select: { name: true, slug: true } } },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          errorCode: 'USER_NOT_FOUND',
          errorMessage: 'المستخدم غير موجود',
        });
      }

      return reply.status(200).send({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          tenantId: user.tenantId,
          networkName: user.tenant?.name ?? 'الشبكة الافتراضية',
          tenantSlug: user.tenant?.slug ?? '',
        },
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch current user profile');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'فشل جلب بيانات الملف الشخصي',
      });
    }
  });
};


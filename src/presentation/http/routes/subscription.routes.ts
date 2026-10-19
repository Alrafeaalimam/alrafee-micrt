// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/subscription.routes.ts
// Presentation Route: Subscription Status & Licensing Diagnostics (Rule 19, Rule 27)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { subscriptionGuard } from '../../../infrastructure/security/SubscriptionGuard.js';
import { redeemLicenseCodeSchema } from '../../validators/admin.validator.js';
import { RedeemLicenseCodeUseCase } from '../../../application/use-cases/admin/RedeemLicenseCodeUseCase.js';
import {
  LicenseCodeNotFoundException,
  LicenseCodeAlreadyUsedException,
  LicenseCodeRevokedException,
} from '../../../domain/exceptions/LicenseExceptions.js';

export const subscriptionRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Requires authentication to know tenantId, but does NOT block expired subscriptions
  fastify.addHook('preHandler', authMiddleware);

  const redeemLicenseCodeUseCase = new RedeemLicenseCodeUseCase();

  /**
   * GET /api/v1/subscription/status
   * Returns current subscription status, trial remaining days, and usage limits.
   */
  fastify.get('/status', async (request, reply) => {
    try {
      const { tenantId } = request.user!;
      const info = await subscriptionGuard.getTenantSubscriptionInfo(tenantId);

      return reply.status(200).send({
        success: true,
        data: {
          subscriptionStatus: info.subscriptionStatus,
          trialEndsAt: info.trialEndsAt.toISOString(),
          subscriptionEndsAt: info.subscriptionEndsAt
            ? info.subscriptionEndsAt.toISOString()
            : null,
          daysRemaining: info.daysRemaining,
          planName: info.planName,
          currentRoutersCount: info.currentRoutersCount,
          maxRoutersLimit: info.maxRoutersLimit,
        },
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch subscription status');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to fetch subscription status',
      });
    }
  });

  /**
   * POST /api/v1/subscription/redeem
   * Redeems a valid unused license code for the tenant (Tenant Admin or Super Admin).
   */
  fastify.post(
    '/redeem',
    {
      preHandler: [requireRole(['TENANT_ADMIN', 'SUPER_ADMIN'])],
    },
    async (request, reply) => {
      const parseResult = redeemLicenseCodeSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: 'كود الترخيص غير صالح',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const { tenantId, userId } = request.user!;
        const result = await redeemLicenseCodeUseCase.execute({
          code: parseResult.data.code,
          tenantId,
          userId,
        });

        return reply.status(200).send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        if (err instanceof LicenseCodeNotFoundException) {
          return reply.status(404).send({
            success: false,
            errorCode: err.code,
            errorMessage: err.message,
          });
        }

        if (err instanceof LicenseCodeAlreadyUsedException) {
          return reply.status(400).send({
            success: false,
            errorCode: err.code,
            errorMessage: err.message,
          });
        }

        if (err instanceof LicenseCodeRevokedException) {
          return reply.status(400).send({
            success: false,
            errorCode: err.code,
            errorMessage: err.message,
          });
        }

        fastify.log.error(err, 'Failed to redeem license code');
        return reply.status(500).send({
          success: false,
          errorCode: 'INTERNAL_ERROR',
          errorMessage: err.message || 'فشل تفعيل كود الترخيص',
        });
      }
    }
  );
};

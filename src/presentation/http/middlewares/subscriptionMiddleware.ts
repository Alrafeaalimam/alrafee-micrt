// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/middlewares/subscriptionMiddleware.ts
// Presentation Middleware: Enforce Active/Trial Subscription (Rule 19, Rule 27)
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { subscriptionGuard } from '../../../infrastructure/security/SubscriptionGuard.js';

/**
 * Fastify preHandler hook that checks if the tenant's subscription is allowed.
 * Applied after authMiddleware on sensitive business routes.
 * Rejects expired/suspended tenants with HTTP 402 Payment Required.
 */
export async function subscriptionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user;
  if (!user || !user.tenantId) {
    return; // authMiddleware will reject if unauthenticated
  }

  const isAllowed = await subscriptionGuard.checkTenantAllowed(user.tenantId);

  if (!isAllowed) {
    return reply.status(402).send({
      success: false,
      errorCode: 'SUBSCRIPTION_EXPIRED',
      errorMessage: 'انتهت الفترة التجريبية، يرجى التواصل للاشتراك',
    });
  }
}

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/middlewares/requireSuperAdmin.ts
// Presentation Middleware: Enforce Platform SUPER_ADMIN Role (Rule 14, Rule 26)
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Fastify preHandler hook that ensures the authenticated user is a SUPER_ADMIN.
 * Rejects unauthorized non-superadmins with 403 Forbidden.
 */
export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user;

  if (!user || !user.role) {
    return reply.status(401).send({
      success: false,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'المصادقة مطلوبة للوصول إلى هذا المورد',
    });
  }

  if (user.role !== 'SUPER_ADMIN') {
    return reply.status(403).send({
      success: false,
      errorCode: 'FORBIDDEN',
      errorMessage: 'هذا المورد مخصص لإدارة المنصة العامة (SUPER_ADMIN) فقط',
    });
  }
}

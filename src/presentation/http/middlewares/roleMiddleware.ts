// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/middlewares/roleMiddleware.ts
// Presentation Middleware: Role-Based Access Control (Rule 14, Rule 19)
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';

export function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userRole = request.user?.role;

    if (!userRole) {
      return reply.status(401).send({
        success: false,
        errorCode: 'UNAUTHORIZED',
        errorMessage: 'المصادقة مطلوبة للوصول إلى هذا المورد',
      });
    }

    if (!allowedRoles.includes(userRole)) {
      return reply.status(403).send({
        success: false,
        errorCode: 'FORBIDDEN',
        errorMessage: 'ليس لديك الصلاحيات الكافية لتنفيذ هذا الإجراء',
      });
    }
  };
}

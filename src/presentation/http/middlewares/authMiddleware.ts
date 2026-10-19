// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/middlewares/authMiddleware.ts
// Presentation Middleware: JWT Authentication & Context Injection (Rule 14, Rule 19)
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, AuthTokenPayload } from '../../../infrastructure/security/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthTokenPayload;
  }
}

/**
 * Fastify preHandler hook that verifies the Bearer JWT token,
 * extracts userId, tenantId, and role, and binds them to request.user.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'رمز المصادقة مفقود أو غير صالح (Bearer token required)',
    });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return reply.status(401).send({
      success: false,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'رمز المصادقة فارغ',
    });
  }

  try {
    const payload = verifyToken(token);
    request.user = payload;
  } catch (err: any) {
    return reply.status(401).send({
      success: false,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'رمز المصادقة منتهي الصلاحية أو غير صالح',
    });
  }
}

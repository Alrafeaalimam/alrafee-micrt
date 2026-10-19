// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/notification.routes.ts
// Presentation Route: User Notifications Endpoints
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { ListMyNotificationsUseCase } from '../../../application/use-cases/notifications/ListMyNotificationsUseCase.js';
import { MarkNotificationReadUseCase } from '../../../application/use-cases/notifications/MarkNotificationReadUseCase.js';

export const notificationRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Enforce JWT authentication on all /api/v1/notifications/* routes
  fastify.addHook('preHandler', authMiddleware);

  const listMyNotificationsUseCase = new ListMyNotificationsUseCase();
  const markNotificationReadUseCase = new MarkNotificationReadUseCase();

  // 1. GET /api/v1/notifications (List all notifications for current user tenant + broadcasts)
  fastify.get('/', async (request: any, reply) => {
    try {
      const userId = request.user?.userId || request.user?.id;
      const tenantId = request.user?.tenantId;

      if (!userId || !tenantId) {
        return reply.status(401).send({
          success: false,
          message: 'يجب تسجيل الدخول للوصول للإشعارات',
        });
      }

      const result = await listMyNotificationsUseCase.execute({
        userId,
        tenantId,
      });

      return reply.status(200).send({
        success: true,
        data: result.notifications,
        unreadCount: result.unreadCount,
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        message: err.message || 'فشل جلب الإشعارات',
      });
    }
  });

  // 2. PATCH /api/v1/notifications/:id/read (Mark a specific notification as read)
  fastify.patch('/:id/read', async (request: any, reply) => {
    try {
      const userId = request.user?.userId || request.user?.id;
      const { id } = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: 'يجب تسجيل الدخول',
        });
      }

      const result = await markNotificationReadUseCase.execute({
        notificationId: id,
        userId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes('غير موجود') ? 404 : 400;
      return reply.status(statusCode).send({
        success: false,
        message: err.message || 'فشل تحديث حالة الإشعار',
      });
    }
  });
};

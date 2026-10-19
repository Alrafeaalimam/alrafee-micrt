// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/settings.routes.ts
// Presentation Route: Public Platform Settings
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { GetPublicSettingsUseCase } from '../../../application/use-cases/settings/GetPublicSettingsUseCase.js';

export const settingsRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  const getPublicSettingsUseCase = new GetPublicSettingsUseCase();

  // GET /api/v1/settings/public (Public, No Auth)
  fastify.get('/public', async (_request, reply) => {
    try {
      const settings = await getPublicSettingsUseCase.execute();
      return reply.status(200).send({
        success: true,
        data: settings,
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        message: err.message || 'فشل جلب إعدادات المنصة',
      });
    }
  });
};

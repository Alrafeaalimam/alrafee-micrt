// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/server.ts
// Entry Point: Fastify HTTP API Server
// Master Reference: Rule 16 (Layers), Rule 18 (Backend Rule), Rule 19 (API Design)
// ============================================================================

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { routerRoutes } from './routes/router.routes.js';
import { packageRoutes } from './routes/package.routes.js';
import { cardRoutes } from './routes/card.routes.js';
import { saleRoutes } from './routes/sale.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { subscriptionRoutes } from './routes/subscription.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] || 'info',
    },
  });

  await app.register(cors, {
    origin: '*',
  });

  // Handle empty JSON bodies gracefully to prevent FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body: string, done) => {
    if (!body || body.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Base Health Check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API v1 Auth Routes (Public)
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  // API v1 Public Settings Routes
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' });

  // API v1 Notifications Routes
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });

  // API v1 Super Admin Routes (Super Admin Protected)
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

  // API v1 Subscription & Licensing Routes
  await app.register(subscriptionRoutes, { prefix: '/api/v1/subscription' });

  // API v1 User & Staff Management Routes (Role Protected)
  await app.register(userRoutes, { prefix: '/api/v1/users' });

  // API v1 Router Diagnostic Routes
  await app.register(routerRoutes, { prefix: '/api/v1/routers' });

  // API v1 Package Routes
  await app.register(packageRoutes, { prefix: '/api/v1/packages' });

  // API v1 Card Routes
  await app.register(cardRoutes, { prefix: '/api/v1/cards' });

  // API v1 Sale Routes
  await app.register(saleRoutes, { prefix: '/api/v1/sales' });

  return app;
}

export async function startServer() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    const address = await app.listen({ port, host });
    app.log.info(`MikroTik Cards Backend running on ${address}`);
    return app;
  } catch (err) {
    app.log.error(err, 'Failed to start Fastify server');
    process.exit(1);
  }
}

// Start server on direct execution
const isDirectExecution =
  process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');

if (isDirectExecution) {
  startServer();
}

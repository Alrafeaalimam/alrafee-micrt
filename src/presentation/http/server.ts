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
    bodyLimit: 10 * 1024 * 1024, // 10MB to accommodate avatar image uploads
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

import fs from 'node:fs';
import path from 'node:path';
import { pgPool } from '../../infrastructure/database/prisma.js';
import { seedDefaultSubscriptionPlans } from '../../infrastructure/database/seed.js';

async function ensureProductionSchema(log: any) {
  try {
    const check = await pgPool.query(
      `SELECT to_regclass('public.subscription_plans') AS tbl;`
    );
    if (!check.rows[0]?.tbl) {
      log.info('Applying migration 20261024100000_add_subscription_plans_and_requests via pgPool...');
      const migrationSqlPath = path.resolve(
        process.cwd(),
        'prisma/migrations/20261024100000_add_subscription_plans_and_requests/migration.sql'
      );
      if (fs.existsSync(migrationSqlPath)) {
        const sql = fs.readFileSync(migrationSqlPath, 'utf8');
        await pgPool.query(sql);
        try {
          await pgPool.query(`
            INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
            VALUES (gen_random_uuid()::text, '', now(), '20261024100000_add_subscription_plans_and_requests', '', null, now(), 1)
            ON CONFLICT ("migration_name") DO NOTHING;
          `);
        } catch (_) {}
        log.info('Migration applied successfully.');
      }
    }

    // Ensure default subscription plans are present (idempotent upsert)
    await seedDefaultSubscriptionPlans();
    log.info('Default subscription plans ensured.');
  } catch (err: any) {
    log.warn({ err: err.message }, 'Notice during startup schema verification');
  }
}

export async function startServer() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await ensureProductionSchema(app.log);
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

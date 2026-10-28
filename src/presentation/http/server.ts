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

  // Ensure production schema & migrations are applied automatically (including Serverless/Vercel)
  if (process.env.NODE_ENV !== 'test') {
    await ensureProductionSchema(app.log);
  }

  return app;
}

import fs from 'node:fs';
import path from 'node:path';
import { pgPool } from '../../infrastructure/database/prisma.js';
import { seedDefaultSubscriptionPlans } from '../../infrastructure/database/seed.js';

let schemaEnsurePromise: Promise<void> | null = null;

export async function ensureProductionSchema(log?: any) {
  if (schemaEnsurePromise) return schemaEnsurePromise;

  schemaEnsurePromise = (async () => {
    try {
      // 1. Ensure subscription_plans & requests exist
      const checkPlans = await pgPool.query(
        `SELECT to_regclass('public.subscription_plans') AS tbl;`
      );
      if (!checkPlans.rows[0]?.tbl) {
        log?.info?.('Applying migration 20261024100000_add_subscription_plans_and_requests via pgPool...');
        const migrationSqlPath = path.resolve(
          process.cwd(),
          'prisma/migrations/20261024100000_add_subscription_plans_and_requests/migration.sql'
        );
        let sql = '';
        if (fs.existsSync(migrationSqlPath)) {
          sql = fs.readFileSync(migrationSqlPath, 'utf8');
        } else {
          // Embedded fallback for serverless/bundled environments
          sql = `
            DO $$ BEGIN CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
            ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
            ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "defaultTrialDays" INTEGER NOT NULL DEFAULT 7;
            CREATE TABLE IF NOT EXISTS "subscription_plans" (
              "id" TEXT NOT NULL,
              "name" TEXT NOT NULL,
              "durationDays" INTEGER NOT NULL,
              "price" DECIMAL(10,2) NOT NULL,
              "currency" TEXT NOT NULL DEFAULT 'SDG',
              "description" TEXT,
              "maxRoutersLimit" INTEGER NOT NULL DEFAULT 5,
              "isActive" BOOLEAN NOT NULL DEFAULT true,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL,
              CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
            );
            CREATE TABLE IF NOT EXISTS "subscription_requests" (
              "id" TEXT NOT NULL,
              "tenantId" TEXT NOT NULL,
              "userId" TEXT NOT NULL,
              "planId" TEXT NOT NULL,
              "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
              "notes" TEXT,
              "reviewNotes" TEXT,
              "reviewedByUserId" TEXT,
              "reviewedAt" TIMESTAMP(3),
              "priceSnapshot" DECIMAL(10,2) NOT NULL,
              "currencySnapshot" TEXT NOT NULL,
              "durationDaysSnapshot" INTEGER NOT NULL,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL,
              CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id")
            );
            CREATE INDEX IF NOT EXISTS "subscription_requests_tenantId_status_idx" ON "subscription_requests"("tenantId", "status");
            CREATE INDEX IF NOT EXISTS "subscription_requests_status_idx" ON "subscription_requests"("status");
            DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_tenantId_fkey') THEN ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
            DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_userId_fkey') THEN ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
            DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_planId_fkey') THEN ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
          `;
        }
        await pgPool.query(sql);
        try {
          await pgPool.query(`
            INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
            VALUES (gen_random_uuid()::text, '', now(), '20261024100000_add_subscription_plans_and_requests', '', null, now(), 1)
            ON CONFLICT ("migration_name") DO NOTHING;
          `);
        } catch (_) {}
        log?.info?.('Subscription plans schema applied successfully.');
      }

      // 2. Ensure manual_payment_methods & subscription_requests columns exist
      const checkMethods = await pgPool.query(
        `SELECT to_regclass('public.manual_payment_methods') AS tbl;`
      );
      const checkReceiptCol = await pgPool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'subscription_requests' AND column_name = 'receiptUrl';`
      );
      if (!checkMethods.rows[0]?.tbl || !checkReceiptCol.rows[0]?.column_name) {
        log?.info?.('Applying migration 20261025180000_add_manual_payment_methods_and_receipts via pgPool...');
        const migrationSqlPath = path.resolve(
          process.cwd(),
          'prisma/migrations/20261025180000_add_manual_payment_methods_and_receipts/migration.sql'
        );
        let sql = '';
        if (fs.existsSync(migrationSqlPath)) {
          sql = fs.readFileSync(migrationSqlPath, 'utf8');
        } else {
          // Embedded fallback
          sql = `
            ALTER TYPE "ConnectionMethod" ADD VALUE IF NOT EXISTS 'REST_API_PLAIN';
            CREATE TABLE IF NOT EXISTS "manual_payment_methods" (
              "id" TEXT NOT NULL,
              "providerName" TEXT NOT NULL,
              "accountName" TEXT NOT NULL,
              "accountNumber" TEXT NOT NULL,
              "beneficiaryName" TEXT,
              "instructions" TEXT,
              "currency" TEXT NOT NULL DEFAULT 'SDG',
              "isActive" BOOLEAN NOT NULL DEFAULT true,
              "displayOrder" INTEGER NOT NULL DEFAULT 0,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL,
              CONSTRAINT "manual_payment_methods_pkey" PRIMARY KEY ("id")
            );
            ALTER TABLE "subscription_requests"
              ADD COLUMN IF NOT EXISTS "paymentMethodId" TEXT,
              ADD COLUMN IF NOT EXISTS "senderName" TEXT,
              ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT,
              ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;
            CREATE INDEX IF NOT EXISTS "subscription_requests_referenceNumber_idx" ON "subscription_requests"("referenceNumber");
            DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_paymentMethodId_fkey') THEN ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "manual_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;
          `;
        }
        await pgPool.query(sql);
        try {
          await pgPool.query(`
            INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
            VALUES (gen_random_uuid()::text, '', now(), '20261025180000_add_manual_payment_methods_and_receipts', '', null, now(), 1)
            ON CONFLICT ("migration_name") DO NOTHING;
          `);
        } catch (_) {}
        log?.info?.('Manual payment methods schema applied successfully.');
      }

      // Ensure default subscription plans are present (idempotent upsert)
      await seedDefaultSubscriptionPlans();
      log?.info?.('Default subscription plans ensured.');
    } catch (err: any) {
      log?.warn?.({ err: err.message }, 'Notice during startup schema verification');
    }
  })();

  return schemaEnsurePromise;
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

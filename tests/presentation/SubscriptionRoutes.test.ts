// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/SubscriptionRoutes.test.ts
// Integration Tests: Subscription, 7-Day Trial & Router Limits (Rule 19, Rule 27)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { randomUUID } from 'node:crypto';

describe('Subscription, Trial & Router Enforcement Integration Tests', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  let testUserId: string;
  let token: string;

  before(async () => {
    app = await buildApp();
    await app.ready();

    // Create a new distinct tenant to test clean subscription lifecycle
    const slug = `sub-test-${Date.now()}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Trial ISP Network',
        slug,
        currency: 'SDG',
        maxRoutersLimit: 1, // set limit to 1 router to test router limit
      },
    });
    testTenantId = tenant.id;

    testUserId = randomUUID();
    const user = await prisma.user.create({
      data: {
        id: testUserId,
        tenantId: testTenantId,
        username: `trial_admin_${Date.now()}`,
        passwordHash: 'dummy_hash',
        fullName: 'Trial Test Admin',
        role: 'TENANT_ADMIN',
      },
    });

    token = signToken({
      userId: user.id,
      tenantId: testTenantId,
      role: 'TENANT_ADMIN',
    });
  });

  after(async () => {
    // Cleanup created tenant and cascading records
    try {
      await prisma.tenant.delete({ where: { id: testTenantId } });
    } catch (_) {}
    await app.close();
  });

  describe('1. New Tenant 7-Day Trial Creation', () => {
    it('should initialize new tenant with TRIAL status and trialEndsAt = +7 days', async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: testTenantId },
      });

      assert.ok(tenant, 'Tenant should exist in database');
      assert.strictEqual(tenant.subscriptionStatus, 'TRIAL');
      assert.strictEqual(tenant.planName, null);

      const now = new Date();
      const diffMs = tenant.trialEndsAt.getTime() - now.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      assert.ok(diffDays >= 6 && diffDays <= 7, `Expected ~7 days trial, got ${diffDays} days`);
    });

    it('GET /api/v1/subscription/status should return 200 OK with trial details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/subscription/status',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.subscriptionStatus, 'TRIAL');
      assert.strictEqual(body.data.planName, null);
      assert.strictEqual(body.data.maxRoutersLimit, 1);
      assert.strictEqual(body.data.currentRoutersCount, 0);
      assert.ok(body.data.daysRemaining >= 6, 'Days remaining should be ~7');
    });

    it('Protected routes should succeed while trial is active', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/routers',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
    });
  });

  describe('2. Router Limit Enforcement (maxRoutersLimit)', () => {
    it('should create 1st router successfully within limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/routers',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          name: 'Router Alpha',
          host: '10.0.0.1',
          port: 8728,
          connectionMethod: 'ROUTEROS_API_PLAIN',
          username: 'admin',
          password: 'secret_password_1',
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
    });

    it('should reject 2nd router with 403 when exceeding maxRoutersLimit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/routers',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          name: 'Router Beta Exceed',
          host: '10.0.0.2',
          port: 8728,
          connectionMethod: 'ROUTEROS_API_PLAIN',
          username: 'admin',
          password: 'secret_password_2',
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'MAX_ROUTERS_LIMIT_EXCEEDED');
      assert.strictEqual(
        body.errorMessage,
        'وصلت للحد الأقصى من الراوترات المسموح به في خطتك الحالية'
      );
    });
  });

  describe('3. Trial Expiry Simulation & 402 Payment Required', () => {
    before(async () => {
      // Simulate trial expiration by setting trialEndsAt to 2 days in the past
      await prisma.tenant.update({
        where: { id: testTenantId },
        data: {
          trialEndsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });
    });

    it('Protected routes (GET /api/v1/routers) should be rejected with 402 Payment Required', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/routers',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      assert.strictEqual(response.statusCode, 402);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'SUBSCRIPTION_EXPIRED');
      assert.strictEqual(
        body.errorMessage,
        'انتهت الفترة التجريبية، يرجى التواصل للاشتراك'
      );
    });

    it('Protected routes (GET /api/v1/packages) should also be rejected with 402', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/packages',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      assert.strictEqual(response.statusCode, 402);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'SUBSCRIPTION_EXPIRED');
    });

    it('GET /api/v1/subscription/status should NOT be blocked by 402, returning EXPIRED status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/subscription/status',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.subscriptionStatus, 'EXPIRED');
      assert.strictEqual(body.data.daysRemaining, 0);
    });
  });
});

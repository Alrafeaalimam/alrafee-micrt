// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/SubscriptionRoutesPhase14.test.ts
// Integration Tests: Subscription Plans, Activation Requests & Auth Resend OTP
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken, signTempToken } from '../../src/infrastructure/security/jwt.js';

describe('Subscription & Plans Routes Phase 14 Tests', () => {
  let app: FastifyInstance;
  let tenantAdminHeaders: { authorization: string };
  let superAdminHeaders: { authorization: string };

  before(async () => {
    app = await buildApp();
    await app.ready();

    const tenantToken = signToken({
      userId: 'faf42d70-d122-40eb-8075-999441fd7096',
      tenantId: '372c6d84-b67d-4ad0-887c-1afcd6a8e5ba',
      role: 'TENANT_ADMIN',
    });
    tenantAdminHeaders = { authorization: `Bearer ${tenantToken}` };

    const superAdminToken = signToken({
      userId: 'admin-super-id',
      tenantId: '5344fd2e-1ece-4449-b3c2-8115aa182ece',
      role: 'SUPER_ADMIN',
    });
    superAdminHeaders = { authorization: `Bearer ${superAdminToken}` };
  });

  after(async () => {
    await app.close();
  });

  it('1. GET /api/v1/subscription/plans should return 200 OK with active plans list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscription/plans',
      headers: tenantAdminHeaders,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  it('2. POST /api/v1/subscription/request-activation with non-existent plan should return 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription/request-activation',
      headers: tenantAdminHeaders,
      payload: {
        planId: 'plan-does-not-exist',
        notes: 'طلب اشتراك تجريبي',
      },
    });

    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'PLAN_NOT_FOUND');
  });

  it('3. GET /api/v1/subscription/my-requests should return 200 OK with requests array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscription/my-requests',
      headers: tenantAdminHeaders,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  it('4. GET /api/v1/admin/subscription-plans should reject non-SUPER_ADMIN with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/subscription-plans',
      headers: tenantAdminHeaders,
    });

    assert.strictEqual(res.statusCode, 403);
  });

  it('5. GET /api/v1/admin/subscription-plans should succeed for SUPER_ADMIN with 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/subscription-plans',
      headers: superAdminHeaders,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  it('6. POST /api/v1/auth/resend-device-otp with invalid tempToken should return 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-device-otp',
      payload: {
        tempToken: 'invalid.jwt.token',
      },
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.errorCode, 'INVALID_TEMP_TOKEN');
  });
});

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/CardRoutes.test.ts
// Integration/Presentation Tests: Fastify Card Routes (Rule 19, Rule 35)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';

describe('Card Routes HTTP Integration Tests', () => {
  let app: FastifyInstance;
  let authHeaders: { authorization: string };

  before(async () => {
    app = await buildApp();
    await app.ready();

    const token = signToken({
      userId: 'faf42d70-d122-40eb-8075-999441fd7096',
      tenantId: '372c6d84-b67d-4ad0-887c-1afcd6a8e5ba',
      role: 'TENANT_ADMIN',
    });
    authHeaders = { authorization: `Bearer ${token}` };
  });

  after(async () => {
    await app.close();
  });

  it('POST /api/v1/cards/generate-batch with invalid payload should return 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cards/generate-batch',
      headers: authHeaders,
      payload: {
        packageId: 'not-a-uuid',
        quantity: -5,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
    assert.ok(body.details);
  });

  it('POST /api/v1/cards/generate-batch with non-existent package should return 404 PACKAGE_NOT_FOUND', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cards/generate-batch',
      headers: authHeaders,
      payload: {
        packageId: '00000000-0000-0000-0000-000000000000',
        quantity: 10,
      },
    });

    assert.strictEqual(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'PACKAGE_NOT_FOUND');
  });

  it('GET /api/v1/cards with invalid query should return 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cards?status=INVALID_STATUS',
      headers: authHeaders,
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
  });

  it('PATCH /api/v1/cards/:id/status with non-existent card should return 404 CARD_NOT_FOUND', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/cards/00000000-0000-0000-0000-000000000000/status',
      headers: authHeaders,
      payload: {
        newStatus: 'AVAILABLE',
      },
    });

    assert.strictEqual(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'CARD_NOT_FOUND');
  });

  it('PATCH /api/v1/cards/:id/status with invalid status string should return 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/cards/00000000-0000-0000-0000-000000000000/status',
      headers: authHeaders,
      payload: {
        newStatus: 'NOT_A_REAL_STATUS',
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
  });

  it('GET /api/v1/cards/batches should return 200 with list of batches for tenant', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cards/batches',
      headers: authHeaders,
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });
});

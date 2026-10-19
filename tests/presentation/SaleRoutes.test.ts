// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/SaleRoutes.test.ts
// Integration/Presentation Tests: Fastify Sale Routes (Rule 8, Rule 19, Rule 35)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';

describe('Sale Routes HTTP Integration Tests', () => {
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

  it('POST /api/v1/sales with invalid payload should return 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: authHeaders,
      payload: {
        cardIds: 'not-an-array',
        paymentMethod: 'GOLD',
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
    assert.ok(body.details);
  });

  it('POST /api/v1/sales with empty cardIds array should return 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: authHeaders,
      payload: {
        cardIds: [],
        paymentMethod: 'CASH',
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
  });

  it('POST /api/v1/sales with invalid card UUID should return 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: authHeaders,
      payload: {
        cardIds: ['invalid-uuid-format'],
        paymentMethod: 'CASH',
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
  });

  it('POST /api/v1/sales with non-existent card UUID should return 404 CARD_NOT_FOUND', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: authHeaders,
      payload: {
        cardIds: ['00000000-0000-0000-0000-000000000000'],
        paymentMethod: 'CASH',
      },
    });

    assert.strictEqual(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'CARD_NOT_FOUND');
  });

  it('GET /api/v1/sales/today-total should return 200 OK with totalAmount and todayTotal', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/today-total',
      headers: authHeaders,
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(typeof body.data.todayTotal === 'number');
    assert.ok(typeof body.data.totalAmount === 'number');
  });

  it('GET /api/v1/sales should return 200 OK with an array of sales', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/sales',
      headers: authHeaders,
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  it('GET /api/v1/sales with invalid date query should return 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/sales?dateFrom=not-a-date',
      headers: authHeaders,
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
  });
});

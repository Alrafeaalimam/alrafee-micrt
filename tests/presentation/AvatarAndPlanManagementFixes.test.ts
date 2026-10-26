// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/AvatarAndPlanManagementFixes.test.ts
// Integration Tests: Avatar Upload & Static Streaming + Admin Plan Deletion & Management
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';

describe('Avatar & Subscription Plan Management Verification Tests', () => {
  let app: FastifyInstance;
  let tenantAdminHeaders: { authorization: string };
  let superAdminHeaders: { authorization: string };
  let testUserId: string;
  let testTenantId: string;

  before(async () => {
    app = await buildApp();
    await app.ready();

    // Ensure a test user exists
    const user = await prisma.user.findFirst({
      where: { role: 'TENANT_ADMIN' },
    });
    if (!user) throw new Error('Test user not found');
    testUserId = user.id;
    testTenantId = user.tenantId;

    const tenantToken = signToken({
      userId: testUserId,
      tenantId: testTenantId,
      role: 'TENANT_ADMIN',
    });
    tenantAdminHeaders = { authorization: `Bearer ${tenantToken}` };

    let superAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          tenantId: testTenantId,
          username: `super_test_${Date.now()}`,
          passwordHash: 'dummy',
          fullName: 'Test Super Admin',
          role: 'SUPER_ADMIN',
        },
      });
    }

    const superAdminToken = signToken({
      userId: superAdmin.id,
      tenantId: superAdmin.tenantId,
      role: 'SUPER_ADMIN',
    });
    superAdminHeaders = { authorization: `Bearer ${superAdminToken}` };
  });

  after(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. Avatar Upload & Serving Tests
  // --------------------------------------------------------------------------

  it('1. POST /api/v1/auth/profile/avatar with valid Base64 image should update avatarUrl and return 200', async () => {
    // 1x1 transparent PNG in base64
    const validPngBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/profile/avatar',
      headers: tenantAdminHeaders,
      payload: { imageBase64: validPngBase64 },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.avatarUrl);
    assert.ok(body.data.avatarUrl.startsWith('/api/v1/auth/avatar/'));

    // Check DB persistence
    const dbUser = await prisma.user.findUnique({ where: { id: testUserId } });
    assert.strictEqual(dbUser?.avatarUrl, body.data.avatarUrl);

    // Verify static streaming endpoint serves the image
    const streamRes = await app.inject({
      method: 'GET',
      url: body.data.avatarUrl,
    });
    assert.strictEqual(streamRes.statusCode, 200);
    assert.strictEqual(streamRes.headers['content-type'], 'image/png');
    assert.ok(streamRes.headers['cache-control']);
  });

  it('2. GET /api/v1/auth/avatar/:filename with path traversal should return 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/avatar/..%2F..%2Fpackage.json',
    });
    assert.ok(res.statusCode === 400 || res.statusCode === 404);
  });

  it('3. PUT /api/v1/auth/profile with Base64 data URI should auto-persist without 500-char error', async () => {
    const validJpgBase64 =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/profile',
      headers: tenantAdminHeaders,
      payload: {
        fullName: 'المهندس أحمد محمد',
        phone: '0912345678',
        avatarUrl: validJpgBase64,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.fullName, 'المهندس أحمد محمد');
    assert.ok(body.data.avatarUrl.startsWith('/api/v1/auth/avatar/'));
  });

  // --------------------------------------------------------------------------
  // 2. Super Admin Subscription Plan CRUD & Safe Deactivation
  // --------------------------------------------------------------------------

  it('4. POST /api/v1/admin/subscription-plans should create plan and return 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/subscription-plans',
      headers: superAdminHeaders,
      payload: {
        name: 'باقة الاختبار الفائقة',
        durationDays: 45,
        price: 25000,
        currency: 'SDG',
        description: 'باقة تجريبية للأدمن',
        maxRoutersLimit: 8,
        isActive: true,
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.name, 'باقة الاختبار الفائقة');
    assert.strictEqual(body.data.price, 25000);
    assert.strictEqual(body.data.durationDays, 45);
  });

  it('5. DELETE /api/v1/admin/subscription-plans/:id on unlinked plan should hard delete (200 OK)', async () => {
    // Create an unlinked plan
    const created = await prisma.subscriptionPlan.create({
      data: {
        name: 'باقة للحذف التجريبي',
        durationDays: 10,
        price: 5000,
        currency: 'SDG',
        maxRoutersLimit: 2,
        isActive: true,
      },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/subscription-plans/${created.id}`,
      headers: superAdminHeaders,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.deleted, true);

    const check = await prisma.subscriptionPlan.findUnique({ where: { id: created.id } });
    assert.strictEqual(check, null);
  });

  it('6. DELETE /api/v1/admin/subscription-plans/:id on linked plan should safely deactivate (200 OK)', async () => {
    // Create a plan and link an activation request to it
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: 'باقة مرتبطة باشتراك مستأجر',
        durationDays: 60,
        price: 30000,
        currency: 'SDG',
        maxRoutersLimit: 5,
        isActive: true,
      },
    });

    await prisma.subscriptionRequest.create({
      data: {
        tenantId: testTenantId,
        userId: testUserId,
        planId: plan.id,
        priceSnapshot: plan.price,
        currencySnapshot: plan.currency,
        durationDaysSnapshot: plan.durationDays,
        status: 'PENDING',
      },
    });

    // Attempt delete
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/subscription-plans/${plan.id}`,
      headers: superAdminHeaders,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.deactivated, true);
    assert.ok(body.message.includes('لحماية سجلات'));

    // Check plan still exists in DB but is inactive
    const check = await prisma.subscriptionPlan.findUnique({ where: { id: plan.id } });
    assert.ok(check);
    assert.strictEqual(check.isActive, false);

    // Clean up test request and plan
    await prisma.subscriptionRequest.deleteMany({ where: { planId: plan.id } });
    await prisma.subscriptionPlan.delete({ where: { id: plan.id } });
  });
});

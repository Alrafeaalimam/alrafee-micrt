// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/AdminLicenseRoutes.test.ts
// Integration Tests: Super Admin Panel & License Code Redemption System (Rule 19, Rule 26, Rule 27)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { randomUUID } from 'node:crypto';

describe('Super Admin Panel & License Code Integration Tests', () => {
  let app: FastifyInstance;
  let superAdminTenantId: string;
  let superAdminUserId: string;
  let superAdminToken: string;

  let regularTenantId: string;
  let regularUserId: string;
  let regularTenantAdminToken: string;

  let generatedCode: string;

  before(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Setup Platform / Super Admin
    superAdminTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: superAdminTenantId,
        name: 'Soft Zone Platform Host',
        slug: `softzone-platform-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'ACTIVE',
        maxRoutersLimit: 9999,
      },
    });

    superAdminUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: superAdminUserId,
        tenantId: superAdminTenantId,
        username: `super_admin_${Date.now()}`,
        passwordHash: 'dummy_hash',
        fullName: 'Global Platform Admin',
        role: 'SUPER_ADMIN',
      },
    });

    superAdminToken = signToken({
      userId: superAdminUserId,
      tenantId: superAdminTenantId,
      role: 'SUPER_ADMIN',
    });

    // 2. Setup Regular Commercial Tenant (TRIAL, maxRoutersLimit: 2)
    regularTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: regularTenantId,
        name: 'Normal Commercial Network',
        slug: `commercial-net-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'TRIAL',
        maxRoutersLimit: 2,
      },
    });

    regularUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: regularUserId,
        tenantId: regularTenantId,
        username: `commercial_admin_${Date.now()}`,
        passwordHash: 'dummy_hash',
        fullName: 'Commercial Network Owner',
        role: 'TENANT_ADMIN',
      },
    });

    regularTenantAdminToken = signToken({
      userId: regularUserId,
      tenantId: regularTenantId,
      role: 'TENANT_ADMIN',
    });
  });

  after(async () => {
    try {
      await prisma.licenseCode.deleteMany({
        where: { createdByUserId: superAdminUserId },
      });
      await prisma.tenant.delete({ where: { id: regularTenantId } });
      await prisma.tenant.delete({ where: { id: superAdminTenantId } });
    } catch (_) {}
    await app.close();
  });

  describe('1. SUPER_ADMIN License Code Management & Generation', () => {
    it('SUPER_ADMIN generates a new license code with 201 Created', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/license-codes',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          planName: 'Enterprise Pro',
          durationDays: 30,
          maxRoutersLimit: 15,
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.code, 'Should return generated code');
      // Format must match XXXX-XXXX-XXXX
      assert.match(
        body.data.code,
        /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
        'License code must match XXXX-XXXX-XXXX format'
      );
      assert.strictEqual(body.data.planName, 'Enterprise Pro');
      assert.strictEqual(body.data.durationDays, 30);
      assert.strictEqual(body.data.maxRoutersLimit, 15);
      assert.strictEqual(body.data.status, 'UNUSED');

      generatedCode = body.data.code;
    });

    it('SUPER_ADMIN lists license codes and newly created code appears in list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/license-codes',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data), 'Data should be an array');

      const found = body.data.find((c: any) => c.code === generatedCode);
      assert.ok(found, 'Generated code should appear in list');
      assert.strictEqual(found.status, 'UNUSED');
      assert.strictEqual(found.usedByTenantId, null);
    });

    it('SUPER_ADMIN lists all tenants with user & router counts and without sensitive credentials', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data), 'Data should be an array');

      const target = body.data.find((t: any) => t.id === regularTenantId);
      assert.ok(target, 'Regular tenant should be in list');
      assert.strictEqual(target.name, 'Normal Commercial Network');
      assert.strictEqual(target.subscriptionStatus, 'TRIAL');
      assert.strictEqual(target.usersCount, 1);
      assert.strictEqual(target.routersCount, 0);

      // Verify no sensitive fields leaked
      assert.strictEqual(target.passwordHash, undefined);
      assert.strictEqual(target.credentials, undefined);
    });
  });

  describe('2. Authorization Controls on /api/v1/admin/*', () => {
    it('Regular TENANT_ADMIN trying GET /api/v1/admin/tenants should be rejected with 403 FORBIDDEN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/tenants',
        headers: {
          authorization: `Bearer ${regularTenantAdminToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'FORBIDDEN');
    });

    it('Regular TENANT_ADMIN trying GET /api/v1/admin/license-codes should be rejected with 403 FORBIDDEN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/license-codes',
        headers: {
          authorization: `Bearer ${regularTenantAdminToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'FORBIDDEN');
    });

    it('Regular TENANT_ADMIN trying POST /api/v1/admin/license-codes should be rejected with 403 FORBIDDEN', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/license-codes',
        headers: {
          authorization: `Bearer ${regularTenantAdminToken}`,
        },
        payload: {
          planName: 'Hacker Plan',
          durationDays: 365,
          maxRoutersLimit: 50,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'FORBIDDEN');
    });

    it('Unauthenticated request to /api/v1/admin/tenants should return 401 UNAUTHORIZED', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/tenants',
      });

      assert.strictEqual(response.statusCode, 401);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'UNAUTHORIZED');
    });
  });

  describe('3. License Code Redemption Flow (/api/v1/subscription/redeem)', () => {
    it('Redeeming non-existent code should be rejected with 404 CODE_NOT_FOUND', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subscription/redeem',
        headers: {
          authorization: `Bearer ${regularTenantAdminToken}`,
        },
        payload: {
          code: 'NON-EXISTENT-CODE',
        },
      });

      assert.strictEqual(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'CODE_NOT_FOUND');
    });

    it('Redeeming valid code activates tenant subscription and updates maxRoutersLimit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subscription/redeem',
        headers: {
          authorization: `Bearer ${regularTenantAdminToken}`,
        },
        payload: {
          code: generatedCode,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.subscriptionStatus, 'ACTIVE');
      assert.strictEqual(body.data.planName, 'Enterprise Pro');
      assert.strictEqual(body.data.maxRoutersLimit, 15);
      assert.ok(body.data.subscriptionEndsAt, 'subscriptionEndsAt must be populated');

      // Verify in database that tenant is really updated
      const updatedTenant = await prisma.tenant.findUnique({
        where: { id: regularTenantId },
      });
      assert.strictEqual(updatedTenant?.subscriptionStatus, 'ACTIVE');
      assert.strictEqual(updatedTenant?.planName, 'Enterprise Pro');
      assert.strictEqual(updatedTenant?.maxRoutersLimit, 15);
      assert.ok(updatedTenant?.subscriptionEndsAt);

      // Verify in database that license code is marked as USED
      const codeRecord = await prisma.licenseCode.findUnique({
        where: { code: generatedCode },
      });
      assert.strictEqual(codeRecord?.status, 'USED');
      assert.strictEqual(codeRecord?.usedByTenantId, regularTenantId);
      assert.ok(codeRecord?.usedAt);
    });

    it('Attempting to redeem the same code twice should be rejected with 400 CODE_ALREADY_USED', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subscription/redeem',
        headers: {
          authorization: `Bearer ${regularTenantAdminToken}`,
        },
        payload: {
          code: generatedCode,
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'CODE_ALREADY_USED');
      assert.match(body.errorMessage, /تم استخدامه مسبقاً/);
    });
  });
});

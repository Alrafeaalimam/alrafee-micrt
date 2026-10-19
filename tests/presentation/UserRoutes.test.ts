// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/UserRoutes.test.ts
// Integration/Presentation Tests: Staff & Roles Management Endpoints (Rule 14, Rule 26)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';
import { seedDefaultTenant } from '../../src/infrastructure/database/seed.js';

describe('Staff & Roles Management Integration Tests (Rule 26)', () => {
  let app: FastifyInstance;
  let tenantId: string;
  let adminUserId = 'faf42d70-d122-40eb-8075-999441fd7096';
  let adminToken: string;
  let operatorToken: string;
  let createdStaffId: string;
  const uniqueSuffix = Date.now().toString().slice(-6);
  const staffUsername = `op_staff_${uniqueSuffix}`;
  const staffPassword = 'Password123!';

  before(async () => {
    tenantId = await seedDefaultTenant();
    app = await buildApp();
    await app.ready();

    // Token for TENANT_ADMIN
    adminToken = signToken({
      userId: adminUserId,
      tenantId,
      role: 'TENANT_ADMIN',
    });

    // Token for OPERATOR
    operatorToken = signToken({
      userId: '77777777-7777-7777-7777-777777777777',
      tenantId,
      role: 'OPERATOR',
    });
  });

  after(async () => {
    await app.close();
  });

  describe('RBAC Authorization Rules', () => {
    it('OPERATOR trying to create a staff user should be rejected with 403 FORBIDDEN', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
        payload: {
          username: `unauthorized_${uniqueSuffix}`,
          password: 'Password123!',
          fullName: 'غير مصرح',
          role: 'OPERATOR',
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'FORBIDDEN');
    });

    it('OPERATOR trying to list staff users should be rejected with 403 FORBIDDEN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'FORBIDDEN');
    });

    it('Unauthenticated request to /api/v1/users should return 401 UNAUTHORIZED', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
      });

      assert.strictEqual(response.statusCode, 401);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'UNAUTHORIZED');
    });
  });

  describe('TENANT_ADMIN Staff Lifecycle', () => {
    it('TENANT_ADMIN creates a new staff user successfully (201 Created)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: staffUsername,
          password: staffPassword,
          fullName: 'مهندس الشبكة علي',
          role: 'OPERATOR',
          email: `${staffUsername}@test.com`,
          phone: '0912345678',
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.id);
      assert.strictEqual(body.data.username, staffUsername);
      assert.strictEqual(body.data.fullName, 'مهندس الشبكة علي');
      assert.strictEqual(body.data.role, 'OPERATOR');
      assert.strictEqual(body.data.status, 'ACTIVE');
      assert.strictEqual(body.data.passwordHash, undefined, 'passwordHash must NEVER be returned');

      createdStaffId = body.data.id;
    });

    it('Newly created staff user should appear in GET /api/v1/users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data));

      const found = body.data.find((u: any) => u.id === createdStaffId);
      assert.ok(found, 'Created staff user must be listed');
      assert.strictEqual(found.username, staffUsername);
      assert.strictEqual(found.role, 'OPERATOR');
      assert.strictEqual(found.passwordHash, undefined);
    });

    it('Newly created staff user can successfully log in via POST /api/v1/auth/login', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: staffUsername,
          password: staffPassword,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.token);
      assert.strictEqual(body.data.user.username, staffUsername);
      assert.strictEqual(body.data.user.role, 'OPERATOR');
    });

    it('TENANT_ADMIN cannot deactivate their own account (400 CANNOT_DEACTIVATE_SELF)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${adminUserId}/deactivate`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'CANNOT_DEACTIVATE_SELF');
    });

    it('TENANT_ADMIN deactivates the staff user (200 OK, status: INACTIVE)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${createdStaffId}/deactivate`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.id, createdStaffId);
      assert.strictEqual(body.data.status, 'INACTIVE');
    });

    it('Deactivated user cannot log in afterwards (rejected with clear message)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: staffUsername,
          password: staffPassword,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'ACCOUNT_INACTIVE');
      assert.ok(body.errorMessage.includes('معطل'));
    });
  });
});

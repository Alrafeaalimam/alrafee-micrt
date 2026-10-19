// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/RegisterRoutes.test.ts
// Integration Tests: Public Self-Registration for New Tenants & Admins (Rule 19, Rule 32)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { verifyToken } from '../../src/infrastructure/security/jwt.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';

describe('Public Self-Registration Integration Tests', () => {
  let app: FastifyInstance;
  const createdTenantIds: string[] = [];

  before(async () => {
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    for (const tenantId of createdTenantIds) {
      try {
        await prisma.tenant.delete({ where: { id: tenantId } });
      } catch (_) {}
    }
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    const timestamp = Date.now();
    const testUsername = `reg_owner_${timestamp}`;
    const testEmail = `reg_owner_${timestamp}@example.com`;

    it('should successfully register a new tenant in PENDING status without immediate JWT', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          networkName: 'شبكة المجد اللاسلكية',
          adminFullName: 'أحمد عثمان',
          username: testUsername,
          email: testEmail,
          password: 'SuperPassword123!',
          phone: '+249912345678',
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.message, 'تم إرسال طلبك، بانتظار موافقة الإدارة');
      assert.strictEqual(body.data.token, undefined, 'No immediate JWT should be returned');
      assert.ok(body.data.tenant, 'Tenant details should be returned');
      assert.ok(body.data.user, 'User details should be returned');

      createdTenantIds.push(body.data.tenant.id);

      // Verify tenant data
      assert.strictEqual(body.data.tenant.name, 'شبكة المجد اللاسلكية');
      assert.ok(body.data.tenant.slug.length > 0, 'Slug should be generated');
      assert.strictEqual(body.data.tenant.subscriptionStatus, 'TRIAL');
      assert.strictEqual(body.data.tenant.approvalStatus, 'PENDING');
      assert.strictEqual(body.data.tenant.maxRoutersLimit, 2);

      // Verify trialEndsAt is ~7 days in the future
      const trialEndsAt = new Date(body.data.tenant.trialEndsAt);
      const now = new Date();
      const diffDays = Math.round(
        (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      assert.strictEqual(diffDays, 7);

      // Verify user data
      assert.strictEqual(body.data.user.username, testUsername);
      assert.strictEqual(body.data.user.fullName, 'أحمد عثمان');
      assert.strictEqual(body.data.user.email, testEmail);
      assert.strictEqual(body.data.user.role, 'TENANT_ADMIN');

      // Verify database record
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: body.data.tenant.id },
      });
      assert.ok(dbTenant);
      assert.strictEqual(dbTenant.approvalStatus, 'PENDING');
      assert.strictEqual(dbTenant.subscriptionStatus, 'TRIAL');
      assert.strictEqual(dbTenant.maxRoutersLimit, 2);

      // Verify audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: body.data.tenant.id,
          action: 'CREATE',
          entityType: 'Tenant',
        },
      });
      assert.ok(auditLog, 'Audit log entry should exist');
    });

    it('should reject registration when username is already taken across the system', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          networkName: 'شبكة أخرى',
          adminFullName: 'محمد علي',
          username: testUsername, // duplicate username
          email: `different_email_${Date.now()}@example.com`,
          password: 'Password888!',
        },
      });

      assert.strictEqual(response.statusCode, 409);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'USERNAME_ALREADY_EXISTS');
      assert.strictEqual(
        body.errorMessage,
        'اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر'
      );
    });

    it('should reject registration when email is already registered across the system', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          networkName: 'شبكة ثالثة',
          adminFullName: 'يوسف حسن',
          username: `unique_user_${Date.now()}`,
          email: testEmail, // duplicate email
          password: 'Password999!',
        },
      });

      assert.strictEqual(response.statusCode, 409);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'EMAIL_ALREADY_EXISTS');
      assert.strictEqual(
        body.errorMessage,
        'البريد الإلكتروني مسجل مسبقاً، يرجى استخدام بريد آخر'
      );
    });

    it('should reject registration with password shorter than 8 characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          networkName: 'شبكة تجريبية',
          adminFullName: 'سالم أحمد',
          username: `short_pass_user_${Date.now()}`,
          email: `short_pass_${Date.now()}@example.com`,
          password: '1234567', // only 7 chars
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
    });

    it('should reject registration with invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          networkName: 'شبكة تجريبية',
          adminFullName: 'سالم أحمد',
          username: `invalid_email_user_${Date.now()}`,
          email: 'not-an-email',
          password: 'ValidPassword123!',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
    });
  });
});

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/AdminPhase2Routes.test.ts
// Integration Tests: Admin Panel Phase 2 (Approval, Management, Direct Licensing)
// Master Reference: Rule 14, Rule 19, Rule 26, Rule 30 (No physical deletion), Rule 32
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { randomUUID } from 'node:crypto';

describe('Admin Panel Phase 2 Integration Tests (Approval, Management, Direct Licensing)', () => {
  let app: FastifyInstance;

  let superAdminTenantId: string;
  let superAdminUserId: string;
  let superAdminToken: string;

  let regularTenantId: string;
  let regularUserId: string;
  let regularTenantToken: string;

  let pendingTenantId: string;
  let pendingUserId: string;
  const pendingPassword = 'StrongPassword123!';

  const createdTenantIds: string[] = [];

  before(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Setup Platform SUPER_ADMIN
    superAdminTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: superAdminTenantId,
        name: 'SOFT ZONE Platform Host',
        slug: `platform-phase2-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
        maxRoutersLimit: 99999,
      },
    });
    createdTenantIds.push(superAdminTenantId);

    superAdminUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: superAdminUserId,
        tenantId: superAdminTenantId,
        username: `super_phase2_${Date.now()}`,
        email: 'alrafeaalimam@gmail.com',
        passwordHash: await hashPassword('AdminPass123!'),
        fullName: 'Global Platform Admin',
        role: 'SUPER_ADMIN',
      },
    });

    superAdminToken = signToken({
      userId: superAdminUserId,
      tenantId: superAdminTenantId,
      role: 'SUPER_ADMIN',
    });

    // 2. Setup Regular Approved Tenant & Staff
    regularTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: regularTenantId,
        name: 'Approved Test Network',
        slug: `approved-net-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
        maxRoutersLimit: 5,
      },
    });
    createdTenantIds.push(regularTenantId);

    regularUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: regularUserId,
        tenantId: regularTenantId,
        username: `staff_user_${Date.now()}`,
        passwordHash: await hashPassword('UserPass123!'),
        fullName: 'Network Operator',
        role: 'OPERATOR',
      },
    });

    regularTenantToken = signToken({
      userId: regularUserId,
      tenantId: regularTenantId,
      role: 'OPERATOR',
    });

    // 3. Setup Pending Tenant
    pendingTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: pendingTenantId,
        name: 'Pending Network Inc',
        slug: `pending-net-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'TRIAL',
        approvalStatus: 'PENDING',
        maxRoutersLimit: 2,
      },
    });
    createdTenantIds.push(pendingTenantId);

    pendingUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: pendingUserId,
        tenantId: pendingTenantId,
        username: `pending_admin_${Date.now()}`,
        email: `pending_${Date.now()}@example.com`,
        passwordHash: await hashPassword(pendingPassword),
        fullName: 'Pending Network Owner',
        role: 'TENANT_ADMIN',
      },
    });
  });

  after(async () => {
    for (const tId of createdTenantIds) {
      try {
        await prisma.tenant.delete({ where: { id: tId } });
      } catch (_) {}
    }
    await app.close();
  });

  describe('1. Registration Approval Workflow & Login Enforcement', () => {
    it('should reject login for a user whose tenant is in PENDING status', async () => {
      const pendingUser = await prisma.user.findUniqueOrThrow({
        where: { id: pendingUserId },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: pendingUser.username,
          password: pendingPassword,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'ACCOUNT_PENDING_APPROVAL');
      assert.strictEqual(body.errorMessage, 'حسابك قيد المراجعة من الإدارة');
    });

    it('should reject approve and reject requests by non-SUPER_ADMIN users (403 Forbidden)', async () => {
      const approveRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/tenants/${pendingTenantId}/approve`,
        headers: { authorization: `Bearer ${regularTenantToken}` },
      });
      assert.strictEqual(approveRes.statusCode, 403);

      const rejectRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/tenants/${pendingTenantId}/reject`,
        headers: { authorization: `Bearer ${regularTenantToken}` },
      });
      assert.strictEqual(rejectRes.statusCode, 403);
    });

    it('SUPER_ADMIN approves tenant -> approvalStatus becomes APPROVED and logs audit log', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/tenants/${pendingTenantId}/approve`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.approvalStatus, 'APPROVED');

      // Verify DB record
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: pendingTenantId },
      });
      assert.strictEqual(dbTenant?.approvalStatus, 'APPROVED');

      // Verify Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: pendingTenantId,
          action: 'UPDATE',
          entityType: 'Tenant',
        },
      });
      assert.ok(audit);
      assert.match(audit.description, /الموافقة على طلب تسجيل/);
    });

    it('User can now log in successfully after approval', async () => {
      const pendingUser = await prisma.user.findUniqueOrThrow({
        where: { id: pendingUserId },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: pendingUser.username,
          password: pendingPassword,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.token);
    });

    it('SUPER_ADMIN rejects a tenant -> approvalStatus becomes REJECTED and logs audit log', async () => {
      // Create a candidate to reject
      const rejectTenant = await prisma.tenant.create({
        data: {
          name: 'Spam Network Candidate',
          slug: `spam-${Date.now()}`,
          approvalStatus: 'PENDING',
        },
      });
      createdTenantIds.push(rejectTenant.id);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/tenants/${rejectTenant.id}/reject`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.approvalStatus, 'REJECTED');

      const dbTenant = await prisma.tenant.findUnique({
        where: { id: rejectTenant.id },
      });
      assert.strictEqual(dbTenant?.approvalStatus, 'REJECTED');

      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: rejectTenant.id,
          action: 'UPDATE',
        },
      });
      assert.ok(audit);
      assert.match(audit.description, /رفض طلب تسجيل/);
    });
  });

  describe('2. Full Admin Management (Suspend, Reactivate, Soft Delete, Role Update)', () => {
    it('SUPER_ADMIN suspends tenant -> subscriptionStatus becomes SUSPENDED', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/tenants/${regularTenantId}/suspend`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.subscriptionStatus, 'SUSPENDED');

      const dbTenant = await prisma.tenant.findUnique({
        where: { id: regularTenantId },
      });
      assert.strictEqual(dbTenant?.subscriptionStatus, 'SUSPENDED');
      assert.strictEqual(dbTenant?.previousSubscriptionStatus, 'ACTIVE');
    });

    it('Suspended tenant login is rejected with clear message', async () => {
      const regUser = await prisma.user.findUniqueOrThrow({
        where: { id: regularUserId },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: regUser.username,
          password: 'UserPass123!',
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorMessage, 'تم إيقاف هذا الحساب مؤقتاً، يرجى التواصل مع إدارة المنصة');
    });

    it('SUPER_ADMIN reactivates tenant -> restores to ACTIVE', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/tenants/${regularTenantId}/reactivate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.subscriptionStatus, 'ACTIVE');

      const dbTenant = await prisma.tenant.findUnique({
        where: { id: regularTenantId },
      });
      assert.strictEqual(dbTenant?.subscriptionStatus, 'ACTIVE');
    });

    it('SUPER_ADMIN soft-deletes tenant -> isDeleted=true, row preserved in DB (Rule 30)', async () => {
      const tenantToSoftDelete = await prisma.tenant.create({
        data: {
          name: 'Network To Soft Delete',
          slug: `soft-del-${Date.now()}`,
          subscriptionStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
        },
      });
      createdTenantIds.push(tenantToSoftDelete.id);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/tenants/${tenantToSoftDelete.id}/delete`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.isDeleted, true);

      // Verify record is NOT deleted physically (Rule 30)
      const dbRecord = await prisma.tenant.findUnique({
        where: { id: tenantToSoftDelete.id },
      });
      assert.ok(dbRecord, 'Record must exist in DB (Soft delete only)');
      assert.strictEqual(dbRecord.isDeleted, true);
      assert.ok(dbRecord.deletedAt instanceof Date);

      // Verify excluded from GET /api/v1/admin/tenants
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      assert.strictEqual(listRes.statusCode, 200);
      const listBody = JSON.parse(listRes.body);
      const found = listBody.data.some((t: any) => t.id === tenantToSoftDelete.id);
      assert.strictEqual(found, false, 'Soft-deleted tenant must not appear in regular listing');
    });

    it('SUPER_ADMIN cannot soft-delete default or platform tenant (protection guard)', async () => {
      const defaultTenant = await prisma.tenant.create({
        data: {
          name: 'Default Platform Tenant Test',
          slug: 'default',
          subscriptionStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
        },
      }).catch(async () => {
        return await prisma.tenant.findUnique({ where: { slug: 'default' } });
      });

      if (defaultTenant) {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/tenants/${defaultTenant.id}/delete`,
          headers: {
            authorization: `Bearer ${superAdminToken}`,
            'content-type': 'application/json',
          },
          payload: '',
        });

        assert.strictEqual(response.statusCode, 400);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.success, false);
        assert.strictEqual(body.errorMessage, 'لا يمكن حذف الحساب الافتراضي للمنصة');
      }
    });

    it('PATCH /approve succeeds with empty body and content-type: application/json', async () => {
      const testPending = await prisma.tenant.create({
        data: {
          name: 'Empty Body Test Tenant',
          slug: `empty-body-${Date.now()}`,
          subscriptionStatus: 'ACTIVE',
          approvalStatus: 'PENDING',
        },
      });
      createdTenantIds.push(testPending.id);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/tenants/${testPending.id}/approve`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: '',
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
    });

    it('GET /api/v1/auth/me returns current user profile with network name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${regularTenantToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.id, regularUserId);
      assert.strictEqual(body.data.role, 'OPERATOR');
      assert.strictEqual(body.data.networkName, 'Approved Test Network');
    });

    it('SUPER_ADMIN updates user role (promotes OPERATOR to TENANT_ADMIN)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${regularUserId}/role`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          role: 'TENANT_ADMIN',
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.newRole, 'TENANT_ADMIN');

      const dbUser = await prisma.user.findUnique({
        where: { id: regularUserId },
      });
      assert.strictEqual(dbUser?.role, 'TENANT_ADMIN');

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: regularUserId,
          action: 'UPDATE',
        },
      });
      assert.ok(audit);
      assert.match(audit.description, /تم تعديل دور المستخدم/);
    });

    it('SUPER_ADMIN lists users of a specific tenant', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/tenants/${regularTenantId}/users`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data));
      const userFound = body.data.some((u: any) => u.id === regularUserId);
      assert.strictEqual(userFound, true);
    });
  });

  describe('3. Direct License Activation by Super Admin', () => {
    it('SUPER_ADMIN directly activates subscription without code redemption', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/tenants/${pendingTenantId}/activate-license`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          planName: 'باقة الأعمال الممتازة (Enterprise)',
          durationDays: 60,
          maxRoutersLimit: 15,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.planName, 'باقة الأعمال الممتازة (Enterprise)');
      assert.strictEqual(body.data.durationDays, 60);
      assert.strictEqual(body.data.maxRoutersLimit, 15);
      assert.strictEqual(body.data.subscriptionStatus, 'ACTIVE');

      // Verify in DB
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: pendingTenantId },
      });
      assert.strictEqual(dbTenant?.subscriptionStatus, 'ACTIVE');
      assert.strictEqual(dbTenant?.maxRoutersLimit, 15);
      assert.strictEqual(dbTenant?.planName, 'باقة الأعمال الممتازة (Enterprise)');
      assert.ok(dbTenant?.subscriptionEndsAt);

      // Verify Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: pendingTenantId,
          action: 'UPDATE',
        },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(audit);
      assert.match(audit.description, /تم تفعيل الترخيص المباشر/);
    });

    it('rejects direct license activation when called by non-SUPER_ADMIN', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/tenants/${pendingTenantId}/activate-license`,
        headers: { authorization: `Bearer ${regularTenantToken}` },
        payload: {
          planName: 'Hacker Plan',
          durationDays: 30,
          maxRoutersLimit: 5,
        },
      });

      assert.strictEqual(response.statusCode, 403);
    });
  });

  describe('6. Platform Super Admin Creation & Flexible Login', () => {
    const timestamp = Date.now();
    const newAdminUsername = `new_superadmin_${timestamp}`;
    const newAdminEmail = `super_${timestamp}@jalsah.network`;
    const newAdminPassword = 'SuperAdminSecurePass123!';

    it('SUPER_ADMIN successfully creates a new SUPER_ADMIN user via POST /api/v1/admin/super-admins', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/super-admins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          fullName: 'المهندس عبد الرحمن',
          username: newAdminUsername,
          email: newAdminEmail,
          password: newAdminPassword,
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.username, newAdminUsername);
      assert.strictEqual(body.data.email, newAdminEmail);
      assert.strictEqual(body.data.role, 'SUPER_ADMIN');
      assert.strictEqual(body.data.status, 'ACTIVE');

      // Verify in DB
      const dbUser = await prisma.user.findUnique({
        where: { id: body.data.id },
      });
      assert.ok(dbUser);
      assert.strictEqual(dbUser.role, 'SUPER_ADMIN');
      assert.strictEqual(dbUser.username, newAdminUsername);
    });

    it('rejects POST /api/v1/admin/super-admins when called by non-SUPER_ADMIN', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/super-admins',
        headers: { authorization: `Bearer ${regularTenantToken}` },
        payload: {
          fullName: 'مستخدم عادي',
          username: `unauthorized_${Date.now()}`,
          email: `unauth_${Date.now()}@example.com`,
          password: 'Password123!',
        },
      });

      assert.strictEqual(response.statusCode, 403);
    });

    it('rejects creating super admin with duplicate username or email (409)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/super-admins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          fullName: 'مدير مكرر',
          username: newAdminUsername,
          email: `another_${Date.now()}@example.com`,
          password: 'Password123!',
        },
      });

      assert.strictEqual(response.statusCode, 409);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.errorCode, 'USERNAME_ALREADY_EXISTS');
    });

    it('new SUPER_ADMIN can log in using email as identifier', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          identifier: newAdminEmail,
          password: newAdminPassword,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.token);
      assert.strictEqual(body.data.user.username, newAdminUsername);
      assert.strictEqual(body.data.user.role, 'SUPER_ADMIN');
    });

    it('new SUPER_ADMIN can log in using username as identifier', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          identifier: newAdminUsername,
          password: newAdminPassword,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.token);
    });
  });
});

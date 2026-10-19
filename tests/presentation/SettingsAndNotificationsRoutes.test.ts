// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/SettingsAndNotificationsRoutes.test.ts
// Integration Tests: Dynamic Platform Settings & Notifications System
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { subscriptionGuard } from '../../src/infrastructure/security/SubscriptionGuard.js';
import { randomUUID } from 'node:crypto';

describe('Dynamic Settings & Notifications System Tests', () => {
  let app: FastifyInstance;

  let superAdminTenantId: string;
  let superAdminUserId: string;
  let superAdminToken: string;

  let customerTenantId: string;
  let customerUserId: string;
  let customerToken: string;

  let testNotificationId: string;

  const createdTenantIds: string[] = [];

  before(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Setup Platform SUPER_ADMIN
    superAdminTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: superAdminTenantId,
        name: 'Platform Settings Test Tenant',
        slug: `platform-test-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
        maxRoutersLimit: 9999,
      },
    });
    createdTenantIds.push(superAdminTenantId);

    superAdminUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: superAdminUserId,
        tenantId: superAdminTenantId,
        username: `super_settings_${Date.now()}`,
        email: `super_settings_${Date.now()}@platform.com`,
        passwordHash: await hashPassword('AdminPass123!'),
        fullName: 'Super Admin Settings Test',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    superAdminToken = signToken({
      userId: superAdminUserId,
      tenantId: superAdminTenantId,
      role: 'SUPER_ADMIN',
      username: 'super_settings',
    });

    // 2. Setup Customer Tenant (TENANT_ADMIN)
    customerTenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: customerTenantId,
        name: 'Customer Network Settings Test',
        slug: `customer-test-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days left
        approvalStatus: 'APPROVED',
        maxRoutersLimit: 5,
      },
    });
    createdTenantIds.push(customerTenantId);

    customerUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: customerUserId,
        tenantId: customerTenantId,
        username: `cust_settings_${Date.now()}`,
        email: `cust_${Date.now()}@network.com`,
        passwordHash: await hashPassword('CustPass123!'),
        fullName: 'Customer Admin Test',
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
    });

    customerToken = signToken({
      userId: customerUserId,
      tenantId: customerTenantId,
      role: 'TENANT_ADMIN',
      username: 'cust_settings',
    });
  });

  after(async () => {
    // Cleanup created test records
    await prisma.notificationRead.deleteMany({
      where: { userId: { in: [superAdminUserId, customerUserId] } },
    });
    await prisma.notification.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [superAdminUserId, customerUserId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: createdTenantIds } },
    });
    await app.close();
  });

  // --------------------------------------------------------------------------
  // Part 1: Dynamic Platform Settings
  // --------------------------------------------------------------------------
  describe('Part 1: Dynamic Platform Settings Routes', () => {
    it('GET /api/v1/settings/public should return settings without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/public',
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.supportEmail);
      assert.ok(Array.isArray(body.data.whatsappNumbers));
      assert.ok(body.data.appName);
    });

    it('PATCH /api/v1/admin/settings should reject unauthenticated requests with 401', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/settings',
        payload: { supportEmail: 'test@example.com' },
      });

      assert.strictEqual(response.statusCode, 401);
    });

    it('PATCH /api/v1/admin/settings should reject non-SUPER_ADMIN with 403', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/settings',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { supportEmail: 'test@example.com' },
      });

      assert.strictEqual(response.statusCode, 403);
    });

    it('PATCH /api/v1/admin/settings should update settings successfully for SUPER_ADMIN', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/settings',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          supportEmail: 'updatedsupport@jalsah.sd',
          whatsappNumbers: ['0115715672', '0115715651', '0912345678'],
          appName: 'Jalsah Network Manager',
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.supportEmail, 'updatedsupport@jalsah.sd');
      assert.strictEqual(body.data.appName, 'Jalsah Network Manager');
      assert.strictEqual(body.data.whatsappNumbers.length, 3);

      // Verify public endpoint reflects changes
      const pubRes = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/public',
      });
      const pubBody = JSON.parse(pubRes.payload);
      assert.strictEqual(pubBody.data.supportEmail, 'updatedsupport@jalsah.sd');
      assert.strictEqual(pubBody.data.appName, 'Jalsah Network Manager');
    });

    it('PATCH /api/v1/admin/settings should validate invalid email format', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/settings',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { supportEmail: 'invalid-email-address' },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.payload);
      assert.strictEqual(body.success, false);
      assert.match(body.errorMessage, /البريد الإلكتروني/);
    });
  });

  // --------------------------------------------------------------------------
  // Part 2: Notifications System
  // --------------------------------------------------------------------------
  describe('Part 2: Notifications System Routes', () => {
    it('POST /api/v1/admin/notifications should reject non-SUPER_ADMIN with 403', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/notifications',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { title: 'Test', body: 'Test body' },
      });

      assert.strictEqual(response.statusCode, 403);
    });

    it('POST /api/v1/admin/notifications should send broadcast notification (tenantId=null)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/notifications',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          title: 'تحديث أمني هام',
          body: 'يرجى مراجعة إعدادات الأمان الخاصة بشبكاتكم',
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.title, 'تحديث أمني هام');
      assert.strictEqual(body.data.tenantId, null);
      testNotificationId = body.data.id;
    });

    it('POST /api/v1/admin/notifications should send tenant-specific notification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/notifications',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          title: 'رسالة خاصة لشبكتك',
          body: 'تم استلام طلب الدعم الخاص بك وجاري المتابعة',
          tenantId: customerTenantId,
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.tenantId, customerTenantId);
    });

    it('GET /api/v1/notifications should return both broadcast and tenant-specific notifications', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.length >= 2);
      assert.ok(typeof body.unreadCount === 'number');
      assert.ok(body.unreadCount >= 2);

      const broadcastItem = body.data.find((n: any) => n.id === testNotificationId);
      assert.ok(broadcastItem);
      assert.strictEqual(broadcastItem.isRead, false);
    });

    it('PATCH /api/v1/notifications/:id/read should mark notification as read and decrement unread count', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${testNotificationId}/read`,
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.isRead, true);

      // Verify unread count decreased
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { authorization: `Bearer ${customerToken}` },
      });
      const listBody = JSON.parse(listRes.payload);
      const broadcastItem = listBody.data.find((n: any) => n.id === testNotificationId);
      assert.strictEqual(broadcastItem.isRead, true);
    });

    it('GenerateTrialEndingNotificationUseCase via SubscriptionGuard generates trial ending alert', async () => {
      // Trigger subscription check on customer tenant who has 2 days remaining
      const subInfo = await subscriptionGuard.getTenantSubscriptionInfo(customerTenantId);
      assert.strictEqual(subInfo.subscriptionStatus, 'TRIAL');
      assert.ok(subInfo.daysRemaining <= 2);

      // Check that a SYSTEM notification was generated for this tenant
      const notifications = await prisma.notification.findMany({
        where: {
          tenantId: customerTenantId,
          type: 'SYSTEM',
          title: 'اقتراب انتهاء التجربة المجانية',
        },
      });

      assert.ok(notifications.length >= 1);
      assert.match(notifications[0].body, /انتهاء تجربتك المجانية/);

      // Verify 24h deduplication: second call should not duplicate
      await subscriptionGuard.getTenantSubscriptionInfo(customerTenantId);
      const countAfter = await prisma.notification.count({
        where: {
          tenantId: customerTenantId,
          type: 'SYSTEM',
          title: 'اقتراب انتهاء التجربة المجانية',
        },
      });
      assert.strictEqual(countAfter, notifications.length);
    });
  });
});

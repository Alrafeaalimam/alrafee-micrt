// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/ManualPaymentAndReceipts.test.ts
// Integration Tests: Manual Payment Methods, Receipt Flow, and Router Validation
// ============================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { prisma, pgPool } from '../../src/infrastructure/database/prisma.js';
import jwt from 'jsonwebtoken';
import { createRouterSchema, updateRouterSchema } from '../../src/presentation/validators/router.validator.js';

describe('Manual Payment Methods, Receipt Flow & Router Validation Tests', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAdminToken: string;
  let tenantId: string;
  let superAdminUserId: string;
  let tenantAdminUserId: string;
  let testPlanId: string;

  before(async () => {
    app = await buildApp();
    await app.ready();

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: `Payment Test Tenant ${Date.now()}`,
        slug: `pay-test-${Date.now()}`,
        subscriptionStatus: 'TRIAL',
        approvalStatus: 'APPROVED',
        status: 'ACTIVE',
      },
    });
    tenantId = tenant.id;

    // Create Super Admin user
    const superAdmin = await prisma.user.create({
      data: {
        tenantId,
        username: `super_pay_${Date.now()}`,
        email: `super_pay_${Date.now()}@platform.local`,
        passwordHash: 'dummyhash',
        fullName: 'Super Admin Pay Test',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });
    superAdminUserId = superAdmin.id;

    // Create Tenant Admin user
    const tenantAdmin = await prisma.user.create({
      data: {
        tenantId,
        username: `admin_pay_${Date.now()}`,
        email: `admin_pay_${Date.now()}@tenant.local`,
        passwordHash: 'dummyhash',
        fullName: 'Tenant Admin Pay Test',
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
    });
    tenantAdminUserId = tenantAdmin.id;

    // Generate valid JWT tokens
    const secret = process.env['JWT_SECRET'] || 'dev-jwt-secret-key-32-chars-long!!';
    superAdminToken = jwt.sign(
      { userId: superAdminUserId, tenantId, role: 'SUPER_ADMIN', username: superAdmin.username },
      secret,
      { expiresIn: '1h' }
    );
    tenantAdminToken = jwt.sign(
      { userId: tenantAdminUserId, tenantId, role: 'TENANT_ADMIN', username: tenantAdmin.username },
      secret,
      { expiresIn: '1h' }
    );

    // Create a test subscription plan
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: 'باقة الاختبار للدفع اليدوي',
        durationDays: 30,
        price: 15000.0,
        currency: 'SDG',
        maxRoutersLimit: 3,
        isActive: true,
      },
    });
    testPlanId = plan.id;
  });

  after(async () => {
    try {
      await prisma.subscriptionRequest.deleteMany({ where: { tenantId } });
      await prisma.subscriptionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.manualPaymentMethod.deleteMany({ where: { providerName: { contains: 'Test' } } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      await app.close();
      await pgPool.end();
    } catch (_) {}
  });

  test('1. Router Validator accepts REST_API_PLAIN in createRouterSchema and updateRouterSchema', () => {
    const validCreate = createRouterSchema.safeParse({
      name: 'Test Router REST',
      host: '10.0.0.1',
      port: 80,
      username: 'admin',
      password: 'mypassword',
      connectionMethod: 'REST_API_PLAIN',
    });
    assert.strictEqual(validCreate.success, true);

    const validUpdate = updateRouterSchema.safeParse({
      connectionMethod: 'REST_API_PLAIN',
    });
    assert.strictEqual(validUpdate.success, true);
  });

  let createdPaymentMethodId: string;

  test('2. Super Admin creates a manual payment method via POST /api/v1/admin/payment-methods', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/payment-methods',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        providerName: 'بنكك Test - بنك الخرطوم',
        accountName: 'محمد أحمد التجريبي',
        accountNumber: '1234567890',
        instructions: 'يرجى إرسال الإشعار بعد التحويل مباشرة',
        currency: 'SDG',
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.accountNumber, '1234567890');
    createdPaymentMethodId = body.data.id;
  });

  test('3. Client retrieves active payment methods via GET /api/v1/subscription/payment-methods', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscription/payment-methods',
      headers: { authorization: `Bearer ${tenantAdminToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.success, true);
    const method = body.data.find((m: any) => m.id === createdPaymentMethodId);
    assert.ok(method);
    assert.strictEqual(method.accountName, 'محمد أحمد التجريبي');
  });

  let submittedRequestId: string;
  const testRefNumber = `TX-${Date.now()}`;

  test('4. Tenant submits activation request with receipt image and payment reference', async () => {
    // 1x1 white png base64
    const sampleReceiptBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription/request-activation',
      headers: { authorization: `Bearer ${tenantAdminToken}` },
      payload: {
        planId: testPlanId,
        paymentMethodId: createdPaymentMethodId,
        senderName: 'عثمان إبراهيم',
        referenceNumber: testRefNumber,
        receiptImageBase64: sampleReceiptBase64,
        notes: 'تم التحويل من تطبيق بنكك',
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.status, 'PENDING');
    assert.strictEqual(body.data.referenceNumber, testRefNumber);
    assert.strictEqual(body.data.senderName, 'عثمان إبراهيم');
    assert.ok(body.data.receiptUrl);
    submittedRequestId = body.data.id;
  });

  test('5. Tenant checks their requests via GET /api/v1/subscription/my-requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscription/my-requests',
      headers: { authorization: `Bearer ${tenantAdminToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.success, true);
    const myReq = body.data.find((r: any) => r.id === submittedRequestId);
    assert.ok(myReq);
    assert.strictEqual(myReq.referenceNumber, testRefNumber);
  });

  test('6. Super Admin lists subscription requests and approves request atomically', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/subscription-requests',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(listRes.statusCode, 200);
    const listBody = listRes.json();
    assert.strictEqual(listBody.success, true);
    const req = listBody.data.find((r: any) => r.id === submittedRequestId);
    assert.ok(req);
    assert.strictEqual(req.senderName, 'عثمان إبراهيم');

    // Approve the request
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/subscription-requests/${submittedRequestId}/approve`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { reviewNotes: 'تم التأكد من استلام المبلغ في الحساب البنكي' },
    });

    assert.strictEqual(approveRes.statusCode, 200);
    const approveBody = approveRes.json();
    assert.strictEqual(approveBody.success, true);
    assert.strictEqual(approveBody.data.status, 'APPROVED');

    // Verify tenant subscription status is now ACTIVE with 30 days extension
    const updatedTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    assert.strictEqual(updatedTenant?.subscriptionStatus, 'ACTIVE');
    assert.strictEqual(updatedTenant?.planName, 'باقة الاختبار للدفع اليدوي');
    assert.ok(updatedTenant?.subscriptionEndsAt);
  });

  test('7. System rejects duplicate reference number once approved (anti-fraud protection)', async () => {
    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription/request-activation',
      headers: { authorization: `Bearer ${tenantAdminToken}` },
      payload: {
        planId: testPlanId,
        paymentMethodId: createdPaymentMethodId,
        senderName: 'محتال',
        referenceNumber: testRefNumber, // Re-using approved reference!
        notes: 'محاولة إعادة استخدام إشعار سابق',
      },
    });

    assert.strictEqual(duplicateRes.statusCode, 400);
    const body = duplicateRes.json();
    assert.strictEqual(body.errorCode, 'DUPLICATE_REFERENCE_NUMBER');
  });

  test('8. Non-super admin cannot create payment method (403 Forbidden)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/payment-methods',
      headers: { authorization: `Bearer ${tenantAdminToken}` },
      payload: {
        providerName: 'Fake',
        accountName: 'Fake',
        accountNumber: '000',
      },
    });

    assert.strictEqual(res.statusCode, 403);
  });

  test('9. Router creation and update accept verified ONLINE status and live hardware specs', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/routers',
      headers: { authorization: `Bearer ${tenantAdminToken}` },
      payload: {
        name: 'Main Verified Router',
        host: '10.0.0.1',
        port: 8728,
        username: 'admin',
        password: 'password123',
        connectionMethod: 'ROUTEROS_API_PLAIN',
        status: 'ONLINE',
        routerOsVersion: '7.15.2',
        boardModel: 'RB4011iGS+5HacQ2HnD',
        cpuLoadPercentage: 12,
        uptimeSeconds: 86400,
      },
    });

    assert.strictEqual(createRes.statusCode, 201);
    const body = createRes.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.status, 'ONLINE');
    assert.strictEqual(body.data.boardModel, 'RB4011iGS+5HacQ2HnD');
    assert.strictEqual(body.data.routerOsVersion, '7.15.2');

    // Update status
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/routers/${body.data.id}`,
      headers: { authorization: `Bearer ${tenantAdminToken}` },
      payload: {
        status: 'ONLINE',
        cpuLoadPercentage: 25,
      },
    });

    assert.strictEqual(updateRes.statusCode, 200);
    const updateBody = updateRes.json();
    assert.strictEqual(updateBody.data.status, 'ONLINE');
    assert.strictEqual(updateBody.data.cpuLoadPercentage, 25);
  });

  test('10. Super Admin can create payment method specifying iban and instructions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/payment-methods',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        providerName: 'بنك أم درمان الوطني',
        accountName: 'أحمد الرفيع',
        accountNumber: '987654321',
        iban: 'SD98ONB00000000987654321',
        instructions: 'يرجى إرفاق إشعار أوكاش أو التحويل البنكي',
        currency: 'SDG',
        isActive: true,
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.providerName, 'بنك أم درمان الوطني');
    assert.strictEqual(body.data.beneficiaryName, 'SD98ONB00000000987654321');
  });

  test('11. Card generation accepts NUMBERS_ONLY with passwordLength: 0 and routerId: null', async () => {
    // Create an active package first
    const pkg = await prisma.package.create({
      data: {
        tenantId,
        name: 'باقة 1 جيجا اختبار',
        code: `PKG-TEST-${Date.now()}`,
        downloadSpeedLimit: '5M',
        uploadSpeedLimit: '2M',
        durationMinutes: 1440,
        validityDays: 1,
        price: 500,
        hotspotProfileName: 'default',
        isActive: true,
      },
    });

    // Make sure tenant is ACTIVE so trial card generation is not locked
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', subscriptionStatus: 'ACTIVE' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cards/generate-batch',
      headers: { authorization: `Bearer ${tenantAdminToken}` },
      payload: {
        packageId: pkg.id,
        quantity: 5,
        routerId: null,
        prefix: null,
        userLength: 8,
        passwordLength: 0,
        generationMode: 'NUMBERS_ONLY',
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.cards.length, 5);
    // All cards have numeric username and empty password
    for (const card of body.data.cards) {
      assert.match(card.username, /^\d{8}$/);
      assert.strictEqual(card.password, '');
    }
  });
});

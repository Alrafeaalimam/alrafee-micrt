// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System (Jalsah)
// File: tests/presentation/DeviceVerificationRoutes.test.ts
// Integration Tests: New Device Login Verification via Email OTP (Rule 14 - Security)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { buildApp } from '../../src/presentation/http/server.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';

describe('New Device Login Verification via Email OTP Integration Tests', () => {
  let app: FastifyInstance;
  let tenantId: string;
  let testUserId: string;
  const testUsername = `user_device_${Date.now()}`;
  const testUserEmail = `device_test_${Date.now()}@jalsah.test`;
  const testPassword = 'SecureDevicePass123!';
  const deviceFingerprint1 = 'fp-android-chrome-001';
  const deviceFingerprint2 = 'fp-windows-edge-002';

  before(async () => {
    process.env.NODE_ENV = 'test';
    app = await buildApp();
    await app.ready();

    // 1. Create a dedicated tenant
    tenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Device Security Test Network',
        slug: `device-test-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
      },
    });

    // 2. Create a fresh test user
    testUserId = randomUUID();
    const passwordHash = await hashPassword(testPassword);
    await prisma.user.create({
      data: {
        id: testUserId,
        tenantId,
        username: testUsername,
        email: testUserEmail,
        passwordHash,
        fullName: 'Device Verification Test User',
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
    });
  });

  after(async () => {
    try {
      await prisma.loginOtp.deleteMany({ where: { userId: testUserId } });
      await prisma.trustedDevice.deleteMany({ where: { userId: testUserId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    } catch (_) {}
    await app.close();
  });

  let savedTempToken: string;
  let rawOtpCode: string;

  it('1. First login from a completely new user/device requires OTP and returns tempToken', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: testUsername,
        password: testPassword,
        deviceFingerprint: deviceFingerprint1,
        deviceLabel: 'متصفح Chrome على أندرويد',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.requiresDeviceVerification, true);
    assert.ok(body.data.tempToken, 'tempToken must be issued');
    assert.strictEqual(body.data.token, undefined, 'Full JWT must NOT be issued before verification');
    assert.match(body.data.message, /تم إرسال كود تحقق لبريدك/);

    savedTempToken = body.data.tempToken;

    // Verify LoginOtp was created in the database
    const dbOtp = await prisma.loginOtp.findFirst({
      where: {
        userId: testUserId,
        used: false,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(dbOtp, 'A login OTP record must exist in DB');
    assert.strictEqual(dbOtp.used, false);

    // Create a known OTP so we can verify it deterministically
    rawOtpCode = '654321';
    const otpHash = await bcrypt.hash(rawOtpCode, 10);
    await prisma.loginOtp.create({
      data: {
        userId: testUserId,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      },
    });
  });

  it('2. tempToken cannot be used to access regular protected endpoints', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${savedTempToken}`,
      },
    });

    assert.strictEqual(response.statusCode, 401, 'tempToken must be rejected by regular auth middleware');
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'UNAUTHORIZED');
  });

  it('3. Wrong OTP code is rejected with 400 INVALID_OR_EXPIRED_OTP', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-device-otp',
      payload: {
        tempToken: savedTempToken,
        otpCode: '000000',
        deviceFingerprint: deviceFingerprint1,
        deviceLabel: 'متصفح Chrome على أندرويد',
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'INVALID_OR_EXPIRED_OTP');
  });

  it('4. Expired OTP code is rejected with 400 INVALID_OR_EXPIRED_OTP', async () => {
    const expiredCode = '112233';
    const expiredHash = await bcrypt.hash(expiredCode, 10);
    await prisma.loginOtp.create({
      data: {
        userId: testUserId,
        otpHash: expiredHash,
        expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
        used: false,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-device-otp',
      payload: {
        tempToken: savedTempToken,
        otpCode: expiredCode,
        deviceFingerprint: deviceFingerprint1,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'INVALID_OR_EXPIRED_OTP');
  });

  it('5. Successful OTP verification creates TrustedDevice, logs Audit, and returns full JWT', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-device-otp',
      payload: {
        tempToken: savedTempToken,
        otpCode: rawOtpCode,
        deviceFingerprint: deviceFingerprint1,
        deviceLabel: 'متصفح Chrome على أندرويد',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.token, 'Full JWT must be issued');
    assert.strictEqual(body.data.user.id, testUserId);

    // Verify TrustedDevice was created in DB
    const trusted = await prisma.trustedDevice.findUnique({
      where: {
        userId_deviceFingerprint: {
          userId: testUserId,
          deviceFingerprint: deviceFingerprint1,
        },
      },
    });
    assert.ok(trusted, 'TrustedDevice must be created in database');
    assert.strictEqual(trusted.deviceFingerprint, deviceFingerprint1);
    assert.strictEqual(trusted.deviceLabel, 'متصفح Chrome على أندرويد');

    // Verify Audit Log was recorded (Rule 26)
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        userId: testUserId,
        action: 'LOGIN',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(auditLog, 'Audit log record must be created');
    assert.strictEqual(auditLog.description, 'دخول من جهاز جديد تم التحقق منه');

    // Verify the full JWT can access protected endpoints
    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${body.data.token}`,
      },
    });
    assert.strictEqual(meResponse.statusCode, 200);
  });

  it('6. Second login with the exact same deviceFingerprint passes directly without OTP', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: testUsername,
        password: testPassword,
        deviceFingerprint: deviceFingerprint1,
        deviceLabel: 'متصفح Chrome على أندرويد',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.token, 'Direct full JWT token must be returned');
    assert.strictEqual(body.data.requiresDeviceVerification, undefined, 'No OTP required on recognized device');
    assert.strictEqual(body.data.user.username, testUsername);

    // Verify lastUsedAt was refreshed
    const trusted = await prisma.trustedDevice.findUnique({
      where: {
        userId_deviceFingerprint: {
          userId: testUserId,
          deviceFingerprint: deviceFingerprint1,
        },
      },
    });
    assert.ok(trusted);
    assert.ok(trusted.lastUsedAt);
  });

  it('7. Login with a different deviceFingerprint for same user requires OTP again', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: testUsername,
        password: testPassword,
        deviceFingerprint: deviceFingerprint2,
        deviceLabel: 'متصفح Edge على Windows',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.requiresDeviceVerification, true, 'New device must require OTP verification');
    assert.ok(body.data.tempToken);
    assert.strictEqual(body.data.token, undefined);
  });

  it('8. Attempting to reuse an already-used OTP code is rejected', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-device-otp',
      payload: {
        tempToken: savedTempToken,
        otpCode: rawOtpCode,
        deviceFingerprint: deviceFingerprint1,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'INVALID_OR_EXPIRED_OTP');
  });

  it('9. Login without deviceFingerprint provides direct login for backward compatibility', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: testUsername,
        password: testPassword,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.token);
  });
});

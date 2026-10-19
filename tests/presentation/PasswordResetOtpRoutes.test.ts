// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System (Jalsah)
// File: tests/presentation/PasswordResetOtpRoutes.test.ts
// Integration Tests: Password Reset via Email OTP (Rule 14 - Security, Rule 19 - Rate Limit)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { buildApp } from '../../src/presentation/http/server.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';

describe('Password Reset via Email OTP Integration Tests', () => {
  let app: FastifyInstance;
  let tenantId: string;
  let testUserId: string;
  const testUserEmail = `reset_test_${Date.now()}@jalsah.test`;
  const initialPassword = 'InitialSecurePassword123!';
  const expectedGenericMessage =
    'إذا كان هذا البريد مسجلاً في النظام، فستصلك رسالة تحتوي على كود التحقق';

  before(async () => {
    process.env.NODE_ENV = 'test';
    app = await buildApp();
    await app.ready();

    // 1. Create a dedicated tenant
    tenantId = randomUUID();
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Password Reset Test Network',
        slug: `reset-test-${Date.now()}`,
        currency: 'SDG',
        subscriptionStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
      },
    });

    // 2. Create test user with email and initial password
    testUserId = randomUUID();
    const passwordHash = await hashPassword(initialPassword);
    await prisma.user.create({
      data: {
        id: testUserId,
        tenantId,
        username: `user_otp_${Date.now()}`,
        email: testUserEmail,
        passwordHash,
        fullName: 'OTP Reset Test User',
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
    });
  });

  after(async () => {
    try {
      await prisma.passwordResetOtp.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.delete({ where: { id: testUserId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    } catch (_) {}
    await app.close();
  });

  describe('1. POST /api/v1/auth/forgot-password (Request OTP)', () => {
    it('request OTP for existing email creates record in database and returns generic message', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: testUserEmail,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.message, expectedGenericMessage);

      // Verify record exists in database
      const createdOtp = await prisma.passwordResetOtp.findFirst({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(createdOtp, 'OTP record should be created in database');
      assert.strictEqual(createdOtp.used, false);
      assert.ok(
        createdOtp.expiresAt.getTime() > Date.now(),
        'expiresAt must be in the future'
      );
      assert.notStrictEqual(
        createdOtp.otpHash.length,
        6,
        'otpHash must NOT be plain 6-digit text'
      );
    });

    it('request OTP for non-existent email returns the EXACT same generic message without error', async () => {
      const ghostEmail = 'non_existent_ghost_9999@domain.xyz';

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: ghostEmail,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.message, expectedGenericMessage);

      // Verify no OTP created for non-existent user
      const ghostUser = await prisma.user.findFirst({
        where: { email: ghostEmail },
      });
      assert.strictEqual(ghostUser, null);
    });

    it('rate limiting: exceeding 3 requests within 15 minutes is silently rejected with the same generic message', async () => {
      // 1st request was sent above. Now send 2nd and 3rd requests:
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email: testUserEmail },
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email: testUserEmail },
      });

      const countBefore = await prisma.passwordResetOtp.count({
        where: { userId: testUserId },
      });
      assert.strictEqual(countBefore, 3, 'Should have exactly 3 OTP records so far');

      // 4th request: exceeds limit of 3 within 15 minutes
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email: testUserEmail },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(
        body.data.message,
        expectedGenericMessage,
        'Must still return the generic message without error'
      );

      // Verify database did NOT create a 4th record
      const countAfter = await prisma.passwordResetOtp.count({
        where: { userId: testUserId },
      });
      assert.strictEqual(
        countAfter,
        3,
        'No 4th OTP should be created when rate limit is exceeded'
      );
    });

    it('rejects invalid email formats with 400 VALIDATION_ERROR', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: 'not-an-email',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
    });
  });

  describe('2. POST /api/v1/auth/reset-password (Reset with OTP)', () => {
    const knownValidOtp = '849201';
    const newPassword = 'NewResetPassword2026!';

    before(async () => {
      // Clean up previous OTPs and plant a known valid OTP
      await prisma.passwordResetOtp.deleteMany({
        where: { userId: testUserId },
      });

      const otpHash = await bcrypt.hash(knownValidOtp, 10);
      await prisma.passwordResetOtp.create({
        data: {
          userId: testUserId,
          otpHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // valid for 10 minutes
          used: false,
        },
      });
    });

    it('reset password with valid OTP succeeds, updates password, and marks OTP as used', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          email: testUserEmail,
          otpCode: knownValidOtp,
          newPassword,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.match(body.data.message, /تم إعادة تعيين كلمة المرور بنجاح/);

      // Verify OTP is marked used in DB
      const otpRecord = await prisma.passwordResetOtp.findFirst({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' },
      });
      assert.strictEqual(otpRecord?.used, true);

      // Verify user can now log in with the new password
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      assert.ok(user);
      const isMatch = await bcrypt.compare(newPassword, user.passwordHash);
      assert.strictEqual(isMatch, true, 'New password hash must match new password');

      // Verify login endpoint works with new password
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: user.username,
          password: newPassword,
        },
      });
      assert.strictEqual(loginRes.statusCode, 200);
    });

    it('attempting to reuse the exact same OTP a second time is rejected with 400 INVALID_OR_EXPIRED_OTP', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          email: testUserEmail,
          otpCode: knownValidOtp,
          newPassword: 'AnotherPassword456!',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'INVALID_OR_EXPIRED_OTP');
    });

    it('attempting to reset with expired OTP is rejected with 400 INVALID_OR_EXPIRED_OTP', async () => {
      const expiredOtpCode = '654321';
      const expiredHash = await bcrypt.hash(expiredOtpCode, 10);

      // Insert expired OTP (expiresAt in the past)
      await prisma.passwordResetOtp.create({
        data: {
          userId: testUserId,
          otpHash: expiredHash,
          expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
          used: false,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          email: testUserEmail,
          otpCode: expiredOtpCode,
          newPassword: 'YetAnotherPassword789!',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'INVALID_OR_EXPIRED_OTP');
    });

    it('attempting to reset with wrong OTP code is rejected with 400 INVALID_OR_EXPIRED_OTP', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          email: testUserEmail,
          otpCode: '000000', // completely wrong code
          newPassword: 'YetAnotherPassword789!',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'INVALID_OR_EXPIRED_OTP');
    });
  });
});

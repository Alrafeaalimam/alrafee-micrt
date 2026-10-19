// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System (Jalsah)
// File: tests/application/RegisterTenantUseCase.test.ts
// Unit Tests: RegisterTenantUseCase & Welcome Email Dispatch (Rule 14, 19, 32)
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RegisterTenantUseCase } from '../../src/application/use-cases/auth/RegisterTenantUseCase.js';
import { IEmailService } from '../../src/infrastructure/email/EmailService.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';

describe('RegisterTenantUseCase Welcome Email Tests', () => {
  it('should call EmailService.sendWelcomeEmail when new tenant registers', async () => {
    let welcomeEmailCalled = false;
    let sentToEmail = '';
    let sentNetworkName = '';

    const mockEmailService: IEmailService = {
      async sendOtpEmail() {
        return true;
      },
      async sendWelcomeEmail(toEmail: string, networkName: string) {
        welcomeEmailCalled = true;
        sentToEmail = toEmail;
        sentNetworkName = networkName;
        return true;
      },
    };

    const useCase = new RegisterTenantUseCase(prisma, undefined, mockEmailService);
    const timestamp = Date.now();
    const networkName = `شبكة التميز ${timestamp}`;
    const email = `tenant_owner_${timestamp}@example.com`;

    const result = await useCase.execute({
      networkName,
      adminFullName: 'طارق عبد الله',
      username: `owner_${timestamp}`,
      email,
      password: 'Password999!',
    });

    assert.ok(result.tenant.id);
    assert.strictEqual(welcomeEmailCalled, true, 'EmailService.sendWelcomeEmail must be called upon registration');
    assert.strictEqual(sentToEmail, email);
    assert.strictEqual(sentNetworkName, networkName);

    // Cleanup created tenant
    try {
      await prisma.tenant.delete({ where: { id: result.tenant.id } });
    } catch (_) {}
  });

  it('should not fail registration if EmailService.sendWelcomeEmail throws an error', async () => {
    const failingEmailService: IEmailService = {
      async sendOtpEmail() {
        return true;
      },
      async sendWelcomeEmail() {
        throw new Error('SMTP connection timed out');
      },
    };

    const useCase = new RegisterTenantUseCase(prisma, undefined, failingEmailService);
    const timestamp = Date.now();

    const result = await useCase.execute({
      networkName: `شبكة صمود ${timestamp}`,
      adminFullName: 'عمر خالد',
      username: `failing_owner_${timestamp}`,
      email: `fail_owner_${timestamp}@example.com`,
      password: 'Password999!',
    });

    assert.ok(result.tenant.id, 'Registration must succeed even if welcome email delivery fails');

    // Cleanup created tenant
    try {
      await prisma.tenant.delete({ where: { id: result.tenant.id } });
    } catch (_) {}
  });
});

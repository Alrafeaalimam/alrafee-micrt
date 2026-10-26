// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/Phase15PreDeploymentAudit.test.ts
// Comprehensive Audit & Regression Tests: Phase 15 Targeted Verifications
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken, signTempToken } from '../../src/infrastructure/security/jwt.js';
import { GenerateCardBatchUseCase } from '../../src/application/use-cases/cards/GenerateCardBatchUseCase.js';
import { TrialCardGenerationLockedException } from '../../src/domain/exceptions/TrialCardGenerationLockedException.js';
import { SubscriptionGuard } from '../../src/infrastructure/security/SubscriptionGuard.js';
import { MockRouterConnector } from '../../src/infrastructure/mikrotik/adapters/MockRouterConnector.js';

describe('Phase 15 Pre-Deployment Audit Test Suite', () => {
  let app: FastifyInstance;
  let tenantAdminHeaders: { authorization: string };
  let superAdminHeaders: { authorization: string };

  const tenantId = '372c6d84-b67d-4ad0-887c-1afcd6a8e5ba';
  const userId = 'faf42d70-d122-40eb-8075-999441fd7096';

  before(async () => {
    app = await buildApp();
    await app.ready();

    const tenantToken = signToken({
      userId,
      tenantId,
      role: 'TENANT_ADMIN',
    });
    tenantAdminHeaders = { authorization: `Bearer ${tenantToken}` };

    const superAdminToken = signToken({
      userId: 'admin-super-id',
      tenantId: '5344fd2e-1ece-4449-b3c2-8115aa182ece',
      role: 'SUPER_ADMIN',
    });
    superAdminHeaders = { authorization: `Bearer ${superAdminToken}` };
  });

  after(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. Subscription Plan Toggle (Super Admin Only)
  // --------------------------------------------------------------------------
  it('1. PATCH /api/v1/admin/subscription-plans/:id/toggle-active should reject non-SUPER_ADMIN with 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/subscription-plans/plan-1-month/toggle-active',
      headers: tenantAdminHeaders,
    });

    assert.strictEqual(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
  });

  it('2. PATCH /api/v1/admin/subscription-plans/:id/toggle-active should toggle active status for SUPER_ADMIN', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/subscription-plans/plan-1-month/toggle-active',
      headers: superAdminHeaders,
    });

    // In test environment or DB, if plan exists it toggles, if not found returns 404
    assert.ok(res.statusCode === 200 || res.statusCode === 404);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, true);
      assert.ok('isActive' in body.data);

      // Toggle back to restore initial state
      await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/subscription-plans/plan-1-month/toggle-active',
        headers: superAdminHeaders,
      });
    }
  });

  // --------------------------------------------------------------------------
  // 2. Subscription Request Cancellation
  // --------------------------------------------------------------------------
  it('3. POST /api/v1/subscription/my-requests/:id/cancel should return 404 for non-existent request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription/my-requests/non-existent-request-id/cancel',
      headers: tenantAdminHeaders,
    });

    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.errorCode, 'REQUEST_NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // 3. Subscription Guard & Trial Lock in GenerateCardBatchUseCase
  // --------------------------------------------------------------------------
  it('4. GenerateCardBatchUseCase must reject TRIAL tenants with TrialCardGenerationLockedException', async () => {
    const mockCardBatchRepo: any = { create: async () => ({ id: 'batch-1' }) };
    const mockCardRepo: any = { findAllByTenant: async () => [], createMany: async () => 1 };
    const mockPkgRepo: any = {
      findById: async () => ({ id: 'pkg-1', name: 'Test Pkg', price: 10, isActive: true }),
    };
    const mockSubGuard: any = {
      getTenantSubscriptionInfo: async () => ({
        isAllowed: true,
        subscriptionStatus: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 86400000),
        subscriptionEndsAt: null,
        daysRemaining: 1,
        planName: null,
        currentRoutersCount: 0,
        maxRoutersLimit: 5,
      }),
    };

    const useCase = new GenerateCardBatchUseCase(
      mockCardBatchRepo,
      mockCardRepo,
      mockPkgRepo,
      undefined,
      undefined,
      undefined,
      mockSubGuard
    );

    await assert.rejects(
      async () => {
        await useCase.execute({
          tenantId: 'trial-tenant',
          packageId: 'pkg-1',
          quantity: 5,
          createdById: 'user-1',
        });
      },
      (err: any) => {
        assert.ok(err instanceof TrialCardGenerationLockedException);
        assert.strictEqual(err.code, 'TRIAL_CARD_GENERATION_LOCKED');
        return true;
      }
    );
  });

  it('5. GenerateCardBatchUseCase must reject EXPIRED tenants', async () => {
    const mockCardBatchRepo: any = { create: async () => ({ id: 'batch-1' }) };
    const mockCardRepo: any = { findAllByTenant: async () => [], createMany: async () => 1 };
    const mockPkgRepo: any = {
      findById: async () => ({ id: 'pkg-1', name: 'Test Pkg', price: 10, isActive: true }),
    };
    const mockSubGuard: any = {
      getTenantSubscriptionInfo: async () => ({
        isAllowed: false,
        subscriptionStatus: 'EXPIRED',
        trialEndsAt: new Date(Date.now() - 86400000),
        subscriptionEndsAt: null,
        daysRemaining: 0,
        planName: null,
        currentRoutersCount: 0,
        maxRoutersLimit: 5,
      }),
    };

    const useCase = new GenerateCardBatchUseCase(
      mockCardBatchRepo,
      mockCardRepo,
      mockPkgRepo,
      undefined,
      undefined,
      undefined,
      mockSubGuard
    );

    await assert.rejects(
      async () => {
        await useCase.execute({
          tenantId: 'expired-tenant',
          packageId: 'pkg-1',
          quantity: 5,
          createdById: 'user-1',
        });
      },
      /Tenant subscription is expired or inactive/
    );
  });

  it('6. GenerateCardBatchUseCase must allow ACTIVE tenant and generate NUMBERS_ONLY with empty password', async () => {
    let capturedCards: any[] = [];
    const mockCardBatchRepo: any = {
      create: async (data: any) => ({ id: 'batch-num', ...data }),
    };
    const mockCardRepo: any = {
      findAllByTenant: async () => [],
      createMany: async (cards: any[]) => {
        capturedCards = cards;
        return cards.map((c, idx) => ({ id: `c-${idx}`, ...c }));
      },
    };
    const mockPkgRepo: any = {
      findById: async () => ({ id: 'pkg-1', name: 'Test Pkg', price: 10, isActive: true }),
    };
    const mockSubGuard: any = {
      getTenantSubscriptionInfo: async () => ({
        isAllowed: true,
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: new Date(Date.now() - 86400000),
        subscriptionEndsAt: new Date(Date.now() + 30 * 86400000),
        daysRemaining: 30,
        planName: 'باقة شهر',
        currentRoutersCount: 1,
        maxRoutersLimit: 5,
      }),
    };

    const useCase = new GenerateCardBatchUseCase(
      mockCardBatchRepo,
      mockCardRepo,
      mockPkgRepo,
      undefined,
      undefined,
      undefined,
      mockSubGuard
    );

    const result = await useCase.execute({
      tenantId: 'active-tenant',
      packageId: 'pkg-1',
      quantity: 10,
      generationMode: 'NUMBERS_ONLY',
      createdById: 'user-1',
    });

    assert.strictEqual(result.cards.length, 10);
    assert.strictEqual(capturedCards.length, 10);

    for (const card of capturedCards) {
      // Must be pure numbers only
      assert.match(card.username, /^[0-9]+$/);
      // Password must be empty string
      assert.strictEqual(card.password, '');
    }
  });

  // --------------------------------------------------------------------------
  // 4. Mock Router Connector with Empty Password
  // --------------------------------------------------------------------------
  it('7. MockRouterConnector must handle createHotspotUser with empty password seamlessly', async () => {
    const connector = new MockRouterConnector();
    const creds = {
      host: '192.168.88.1',
      port: 8728,
      username: 'admin',
      password: 'password',
      connectionMethod: 'API_BINARY' as const,
    };

    const result = await connector.createHotspotUser(
      creds,
      '84920184',
      '', // empty password
      'default',
      { comment: 'Jalsah:TestNumbersOnly' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data, undefined);
  });
});

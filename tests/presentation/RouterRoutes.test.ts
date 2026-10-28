// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/presentation/RouterRoutes.test.ts
// Integration Tests: Router Endpoints, Diagnostics & Tenant Isolation (Rule 16, Rule 19)
// ============================================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/presentation/http/server.js';
import { signToken } from '../../src/infrastructure/security/jwt.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { randomUUID } from 'node:crypto';

describe('Router Endpoints & Diagnostic Integration Tests', () => {
  let app: FastifyInstance;
  let tenant1Id: string;
  let tenant2Id: string;
  let token1: string;
  let token2: string;
  let router1Id: string;

  before(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Create Tenant 1
    const t1 = await prisma.tenant.create({
      data: {
        name: 'Tenant Router Test 1',
        slug: `router-test-1-${Date.now()}`,
        currency: 'USD',
      },
    });
    tenant1Id = t1.id;

    const u1 = await prisma.user.create({
      data: {
        id: randomUUID(),
        tenantId: tenant1Id,
        username: `router_admin_1_${Date.now()}`,
        passwordHash: 'dummy_hash',
        fullName: 'Router Admin 1',
        role: 'TENANT_ADMIN',
      },
    });

    token1 = signToken({
      userId: u1.id,
      tenantId: tenant1Id,
      role: 'TENANT_ADMIN',
    });

    // 2. Create Tenant 2 (for tenant isolation tests)
    const t2 = await prisma.tenant.create({
      data: {
        name: 'Tenant Router Test 2',
        slug: `router-test-2-${Date.now()}`,
        currency: 'USD',
      },
    });
    tenant2Id = t2.id;

    const u2 = await prisma.user.create({
      data: {
        id: randomUUID(),
        tenantId: tenant2Id,
        username: `router_admin_2_${Date.now()}`,
        passwordHash: 'dummy_hash',
        fullName: 'Router Admin 2',
        role: 'TENANT_ADMIN',
      },
    });

    token2 = signToken({
      userId: u2.id,
      tenantId: tenant2Id,
      role: 'TENANT_ADMIN',
    });
  });

  after(async () => {
    try {
      if (tenant1Id) await prisma.tenant.delete({ where: { id: tenant1Id } });
      if (tenant2Id) await prisma.tenant.delete({ where: { id: tenant2Id } });
    } catch (_) {}
  });

  // --------------------------------------------------------------------------
  // 1. Authentication & Payload Validation
  // --------------------------------------------------------------------------
  describe('1. Endpoint Authentication & Validation', () => {
    it('should reject unauthenticated request to /test-connection with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routers/test-connection',
        payload: {
          host: '1.1.1.1',
          port: 8729,
          username: 'admin',
          password: 'password',
        },
      });

      assert.strictEqual(res.statusCode, 401);
    });

    it('should reject invalid payload with 400 VALIDATION_ERROR', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routers/test-connection',
        headers: { authorization: `Bearer ${token1}` },
        payload: {
          host: '',
          port: 999999, // invalid port
          username: '',
          password: '',
        },
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
    });

    it('should block SSRF target (169.254.169.254) with 422 SSRF_BLOCKED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routers/test-connection',
        headers: { authorization: `Bearer ${token1}` },
        payload: {
          host: '169.254.169.254',
          port: 8729,
          username: 'admin',
          password: 'password',
        },
      });

      assert.strictEqual(res.statusCode, 422);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'SSRF_BLOCKED');
    });

    it('should reject port 8728 with ROUTEROS_API_SSL with 422 INVALID_PORT_CONFIGURATION', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routers/test-connection',
        headers: { authorization: `Bearer ${token1}` },
        payload: {
          host: '1.1.1.1',
          port: 8728,
          username: 'admin',
          password: 'password',
          connectionMethod: 'ROUTEROS_API_SSL',
        },
      });

      assert.strictEqual(res.statusCode, 422);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'INVALID_PORT_CONFIGURATION');
      assert.match(body.errorMessage, /تعارض أمني/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Router Creation & Security (No Password Leakage)
  // --------------------------------------------------------------------------
  describe('2. Router Creation & Zero Password Exposure', () => {
    it('should create a router successfully without exposing plaintext password in response', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routers',
        headers: { authorization: `Bearer ${token1}` },
        payload: {
          name: 'Main Gateway RB4011',
          host: '192.0.2.1', // Reserved TEST-NET
          port: 8729,
          username: 'router_admin',
          password: 'super_secret_router_pass_999',
          connectionMethod: 'ROUTEROS_API_SSL',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.id);
      router1Id = body.data.id;

      // Ensure plaintext password is never exposed in response
      assert.strictEqual(body.data.password, undefined);
      assert.strictEqual(body.data.encryptedPassword, undefined);
      assert.strictEqual(body.data.credentials?.encryptedPassword, undefined);
      assert.doesNotMatch(res.body, /super_secret_router_pass_999/);
    });

    it('should list routers without exposing credentials or secrets', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/routers',
        headers: { authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.strictEqual(body.data.length, 1);
      assert.strictEqual(body.data[0].id, router1Id);

      // Verify no passwords in listing
      assert.doesNotMatch(res.body, /super_secret_router_pass_999/);
      assert.strictEqual(body.data[0].credentials?.encryptedPassword, undefined);
    });

    it('should create a router with status ONLINE and persist it correctly', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routers',
        headers: { authorization: `Bearer ${token1}` },
        payload: {
          name: 'Online Branch Router',
          host: '192.168.10.1',
          port: 8728,
          username: 'router_admin',
          password: 'pass',
          connectionMethod: 'ROUTEROS_API_PLAIN',
          status: 'ONLINE',
          routerOsVersion: '7.15.2',
          boardModel: 'RB5009UG+S+IN',
          cpuLoadPercentage: 12,
          uptimeSeconds: 3600,
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.status, 'ONLINE');
      assert.strictEqual(body.data.boardModel, 'RB5009UG+S+IN');
      assert.strictEqual(body.data.routerOsVersion, '7.15.2');
      assert.ok(body.data.lastSeenAt);

      // Verify persistence via GET /api/v1/routers
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/routers',
        headers: { authorization: `Bearer ${token1}` },
      });
      assert.strictEqual(listRes.statusCode, 200);
      const listBody = JSON.parse(listRes.body);
      const found = listBody.data.find((r: any) => r.id === body.data.id);
      assert.ok(found);
      assert.strictEqual(found.status, 'ONLINE');
      assert.strictEqual(found.boardModel, 'RB5009UG+S+IN');
    });

    it('should create a router without status defaulting to OFFLINE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routers',
        headers: { authorization: `Bearer ${token1}` },
        payload: {
          name: 'Offline Default Router',
          host: '192.168.20.1',
          port: 8728,
          username: 'router_admin',
          password: 'pass',
          connectionMethod: 'ROUTEROS_API_PLAIN',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.status, 'OFFLINE');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Stored Router Diagnostic Test & Tenant Isolation
  // --------------------------------------------------------------------------
  describe('3. POST /api/v1/routers/:id/test-connection & Tenant Isolation', () => {
    it('should reject when Tenant 2 tries to test connection of Tenant 1 router (404 isolation)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/routers/${router1Id}/test-connection`,
        headers: { authorization: `Bearer ${token2}` },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'ROUTER_NOT_FOUND');
    });

    it('should return 404 for non-existent router ID', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/routers/${fakeId}/test-connection`,
        headers: { authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'ROUTER_NOT_FOUND');
    });

    it('should attempt diagnostic on stored router and update health status in database', async () => {
      // Diagnostic on non-routable test host 192.0.2.1 should timeout or fail cleanly
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/routers/${router1Id}/test-connection`,
        headers: { authorization: `Bearer ${token1}` },
      });

      // Response must be 422 with a structured error, never 500
      assert.strictEqual(res.statusCode, 422);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.ok(['TIMEOUT', 'HOST_UNREACHABLE', 'CONNECTION_REFUSED', 'CONNECTION_RESET', 'TLS_HANDSHAKE_ERROR', 'ROUTER_COMMUNICATION_ERROR'].includes(body.errorCode));

      // Verify that router health status in DB was updated to ERROR with the errorMessage
      const dbRouter = await prisma.router.findUnique({
        where: { id: router1Id },
      });
      assert.strictEqual(dbRouter?.status, 'ERROR');
      assert.ok(dbRouter?.lastHealthCheckAt);
      assert.strictEqual(dbRouter?.lastErrorMessage, body.errorMessage);

      // Verify secret password was NOT leaked into lastErrorMessage
      assert.doesNotMatch(dbRouter?.lastErrorMessage || '', /super_secret_router_pass_999/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Rate Limiting on Diagnostic Endpoints
  // --------------------------------------------------------------------------
  describe('4. Rate Limiting on Diagnostic Endpoints', () => {
    it('should return 429 TOO_MANY_REQUESTS when tenant exceeds request rate limit', async () => {
      // Send rapid requests to exceed rate limit
      const prevMax = process.env.ROUTER_PROBE_RATE_LIMIT_MAX;
      process.env.ROUTER_PROBE_RATE_LIMIT_MAX = '2';

      try {
        let reached429 = false;
        let lastRes: any = null;

        for (let i = 0; i < 10; i++) {
          lastRes = await app.inject({
            method: 'POST',
            url: '/api/v1/routers/test-connection',
            headers: { authorization: `Bearer ${token1}` },
            payload: {
              host: '169.254.1.1', // Will quickly fail SSRF if allowed to run
              port: 8729,
              username: 'admin',
              password: 'password',
            },
          });

          if (lastRes.statusCode === 429) {
            reached429 = true;
            break;
          }
        }

        assert.strictEqual(reached429, true);
        assert.strictEqual(lastRes.statusCode, 429);
        const body = JSON.parse(lastRes.body);
        assert.strictEqual(body.success, false);
        assert.strictEqual(body.errorCode, 'TOO_MANY_REQUESTS');
        assert.ok(lastRes.headers['retry-after']);

        // Verify Tenant 2 is NOT rate-limited (Tenant Isolation)
        const tenant2Res = await app.inject({
          method: 'POST',
          url: '/api/v1/routers/test-connection',
          headers: { authorization: `Bearer ${token2}` },
          payload: {
            host: '169.254.1.1',
            port: 8729,
            username: 'admin',
            password: 'password',
          },
        });

        // Tenant 2 must get 422 (SSRF_BLOCKED), NOT 429!
        assert.strictEqual(tenant2Res.statusCode, 422);
        const t2Body = JSON.parse(tenant2Res.body);
        assert.strictEqual(t2Body.errorCode, 'SSRF_BLOCKED');
      } finally {
        if (prevMax !== undefined) process.env.ROUTER_PROBE_RATE_LIMIT_MAX = prevMax;
        else delete process.env.ROUTER_PROBE_RATE_LIMIT_MAX;
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Hotspot Users & Sessions Endpoints with Strict Tenant Isolation
  // --------------------------------------------------------------------------
  describe('5. Hotspot Users & Sessions Endpoints with Strict Tenant Isolation', () => {
    it('GET /:id/hotspot-users should return 404 when requested by another tenant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/routers/${router1Id}/hotspot-users`,
        headers: { authorization: `Bearer ${token2}` },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'ROUTER_NOT_FOUND');
    });

    it('GET /:id/hotspot-sessions should return 404 when requested by another tenant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/routers/${router1Id}/hotspot-sessions`,
        headers: { authorization: `Bearer ${token2}` },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'ROUTER_NOT_FOUND');
    });

    it('PATCH /:id/hotspot-users/:username with invalid body should return 400 VALIDATION_ERROR', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/routers/${router1Id}/hotspot-users/testuser`,
        headers: { authorization: `Bearer ${token1}` },
        payload: {}, // Missing isEnabled boolean
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'VALIDATION_ERROR');
    });

    it('PATCH /:id/hotspot-users/:username should return 404 when requested by another tenant', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/routers/${router1Id}/hotspot-users/testuser`,
        headers: { authorization: `Bearer ${token2}` },
        payload: { isEnabled: false },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'ROUTER_NOT_FOUND');
    });

    it('POST /:id/hotspot-sessions/:username/disconnect should return 404 when requested by another tenant', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/routers/${router1Id}/hotspot-sessions/testuser/disconnect`,
        headers: { authorization: `Bearer ${token2}` },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.errorCode, 'ROUTER_NOT_FOUND');
    });
  });
});

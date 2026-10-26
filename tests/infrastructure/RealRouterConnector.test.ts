// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/infrastructure/RealRouterConnector.test.ts
// Unit Tests: Real MikroTik Connector, Protocols, SSRF, Error Mapping & Security
// Test Runner: Node.js Built-in Test Runner via tsx
// ============================================================================

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { RealRouterConnector } from '../../src/infrastructure/mikrotik/adapters/RealRouterConnector.js';
import { SsrfProtection } from '../../src/infrastructure/security/SsrfProtection.js';
import {
  mapRouterError,
  parseRouterOsUptime,
} from '../../src/infrastructure/mikrotik/adapters/MikroTikErrorMapper.js';
import { MikroTikRestClient } from '../../src/infrastructure/mikrotik/adapters/MikroTikRestClient.js';

describe('RealRouterConnector & Security Unit Tests', () => {
  const connector = new RealRouterConnector();

  // --------------------------------------------------------------------------
  // 1. SSRF Protection Tests
  // --------------------------------------------------------------------------
  describe('1. SSRF & Ingress/Egress Target Protection', () => {
    it('should strictly block loopback IPv4 (127.0.0.1)', async () => {
      const result = await SsrfProtection.validateTarget('127.0.0.1', false);
      assert.strictEqual(result.isAllowed, false);
      assert.match(result.reason || '', /LOOPBACK|محظورة أمنياً/);
    });

    it('should strictly block cloud metadata service IP (169.254.169.254)', async () => {
      const result = await SsrfProtection.validateTarget('169.254.169.254', true);
      assert.strictEqual(result.isAllowed, false);
      assert.match(result.reason || '', /CLOUD_METADATA|محظورة أمنياً/);
    });

    it('should strictly block broadcast and unspecified addresses (0.0.0.0, 255.255.255.255)', async () => {
      const r0 = await SsrfProtection.validateTarget('0.0.0.0', true);
      assert.strictEqual(r0.isAllowed, false);

      const r255 = await SsrfProtection.validateTarget('255.255.255.255', true);
      assert.strictEqual(r255.isAllowed, false);
    });

    it('should strictly block IPv6 loopback (::1) and link-local (fe80::1)', async () => {
      const r1 = await SsrfProtection.validateTarget('::1', true);
      assert.strictEqual(r1.isAllowed, false);

      const rFe80 = await SsrfProtection.validateTarget('fe80::1', true);
      assert.strictEqual(rFe80.isAllowed, false);
    });

    it('should strictly block alternative IPv6 representations including bracketed and hex-mapped formats', async () => {
      // Bracketed IPv6 loopback [::1] and [127.0.0.1]
      const rBracket6 = await SsrfProtection.validateTarget('[::1]', true);
      assert.strictEqual(rBracket6.isAllowed, false);

      const rBracket4 = await SsrfProtection.validateTarget('[127.0.0.1]', true);
      assert.strictEqual(rBracket4.isAllowed, false);

      // Hex IPv4-mapped loopback (::ffff:7f00:1)
      const rHexLoop = await SsrfProtection.validateTarget('::ffff:7f00:1', true);
      assert.strictEqual(rHexLoop.isAllowed, false);
      assert.match(rHexLoop.reason || '', /IPV6_MAPPED_LOOPBACK|محظورة أمنياً/);

      // Hex IPv4-mapped cloud metadata (::ffff:a9fe:a9fe)
      const rHexMeta = await SsrfProtection.validateTarget('::ffff:a9fe:a9fe', true);
      assert.strictEqual(rHexMeta.isAllowed, false);
      assert.match(rHexMeta.reason || '', /IPV6_MAPPED_CLOUD_METADATA|محظورة أمنياً/);

      // Dotted IPv4-mapped loopback (::ffff:127.0.0.1)
      const rDotMapped = await SsrfProtection.validateTarget('::ffff:127.0.0.1', true);
      assert.strictEqual(rDotMapped.isAllowed, false);

      // IPv4-compatible loopback (::127.0.0.1)
      const rCompat = await SsrfProtection.validateTarget('::127.0.0.1', true);
      assert.strictEqual(rCompat.isAllowed, false);
    });

    it('should strictly block localhost and local domain names', async () => {
      const rLocalhost = await SsrfProtection.validateTarget('localhost', true);
      assert.strictEqual(rLocalhost.isAllowed, false);

      const rInternal = await SsrfProtection.validateTarget('service.internal', true);
      assert.strictEqual(rInternal.isAllowed, false);
    });

    it('should block private RFC1918 IPs by default in production mode', async () => {
      const r10 = await SsrfProtection.validateTarget('10.0.0.1', false);
      assert.strictEqual(r10.isAllowed, false);

      const r192 = await SsrfProtection.validateTarget('192.168.1.1', false);
      assert.strictEqual(r192.isAllowed, false);
    });

    it('should allow public routable IPv4 addresses', async () => {
      const rPublic = await SsrfProtection.validateTarget('1.1.1.1', false);
      assert.strictEqual(rPublic.isAllowed, true);
    });

    it('should permit private IP if explicitly matching AUTHORIZED_VPN_SUBNETS in production mode', async () => {
      const prev = process.env.AUTHORIZED_VPN_SUBNETS;
      try {
        process.env.AUTHORIZED_VPN_SUBNETS = '10.200.0.0/24';
        const rMatch = await SsrfProtection.validateTarget('10.200.0.5', false);
        assert.strictEqual(rMatch.isAllowed, true);
        assert.strictEqual(rMatch.isPrivate, true);

        // Subnet outside authorized range must still be strictly blocked
        const rOther = await SsrfProtection.validateTarget('10.200.1.5', false);
        assert.strictEqual(rOther.isAllowed, false);
      } finally {
        if (prev !== undefined) process.env.AUTHORIZED_VPN_SUBNETS = prev;
        else delete process.env.AUTHORIZED_VPN_SUBNETS;
      }
    });

    it('should NEVER allow dangerous addresses (loopback, metadata) even if included in AUTHORIZED_VPN_SUBNETS', async () => {
      const prev = process.env.AUTHORIZED_VPN_SUBNETS;
      try {
        process.env.AUTHORIZED_VPN_SUBNETS = '127.0.0.0/8,169.254.0.0/16';
        const rLoopback = await SsrfProtection.validateTarget('127.0.0.1', false);
        assert.strictEqual(rLoopback.isAllowed, false);

        const rMeta = await SsrfProtection.validateTarget('169.254.169.254', false);
        assert.strictEqual(rMeta.isAllowed, false);
      } finally {
        if (prev !== undefined) process.env.AUTHORIZED_VPN_SUBNETS = prev;
        else delete process.env.AUTHORIZED_VPN_SUBNETS;
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Error Mapping & Zero Secret Leakage Tests
  // --------------------------------------------------------------------------
  describe('2. Error Mapping & Zero Secret Leakage', () => {
    it('should map authentication failure without leaking credentials', () => {
      const rawError = new Error('invalid user name or password (secret_pass_12345)');
      const mapped = mapRouterError(rawError);

      assert.strictEqual(mapped.errorCode, 'AUTHENTICATION_FAILED');
      assert.match(mapped.errorMessage, /فشلت المصادقة/);
      assert.doesNotMatch(mapped.errorMessage, /secret_pass_12345/);
    });

    it('should map permission denial when user lacks router privileges', () => {
      const rawError = new Error('not enough permissions to access /system/resource');
      const mapped = mapRouterError(rawError);

      assert.strictEqual(mapped.errorCode, 'PERMISSION_DENIED');
      assert.match(mapped.errorMessage, /صلاحيات غير كافية/);
    });

    it('should map self-signed TLS certificate error with actionable guidance', () => {
      const rawError: any = new Error('self signed certificate');
      rawError.code = 'DEPTH_ZERO_SELF_SIGNED_CERT';
      const mapped = mapRouterError(rawError);

      assert.strictEqual(mapped.errorCode, 'TLS_SELF_SIGNED_CERTIFICATE');
      assert.match(mapped.errorMessage, /ذاتية التوقيع/);
      assert.match(mapped.errorMessage, /SHA-256/);
    });

    it('should map TLS certificate fingerprint mismatch', () => {
      const rawError: any = new Error('Certificate fingerprint mismatch');
      rawError.code = 'TLS_FINGERPRINT_MISMATCH';
      const mapped = mapRouterError(rawError);

      assert.strictEqual(mapped.errorCode, 'TLS_FINGERPRINT_MISMATCH');
      assert.match(mapped.errorMessage, /بصمة شهادة SSL/);
    });

    it('should map connection refused and unreachable hosts', () => {
      const rawRefused: any = new Error('connect ECONNREFUSED 192.0.2.1:8729');
      rawRefused.code = 'ECONNREFUSED';
      const mRefused = mapRouterError(rawRefused);
      assert.strictEqual(mRefused.errorCode, 'CONNECTION_REFUSED');

      const rawUnreach: any = new Error('connect EHOSTUNREACH 192.0.2.1:8729');
      rawUnreach.code = 'EHOSTUNREACH';
      const mUnreach = mapRouterError(rawUnreach);
      assert.strictEqual(mUnreach.errorCode, 'HOST_UNREACHABLE');
    });

    it('should map connection timeout accurately', () => {
      const rawTimeout: any = new Error('Socket timed out after 5000ms');
      rawTimeout.code = 'ETIMEDOUT';
      const mapped = mapRouterError(rawTimeout);

      assert.strictEqual(mapped.errorCode, 'TIMEOUT');
      assert.match(mapped.errorMessage, /انتهت المهلة الزمنية/);
    });

    it('should map missing REST API endpoint to UNSUPPORTED_VERSION', () => {
      const raw404: any = new Error('REST API endpoint not found (HTTP 404)');
      raw404.code = '404';
      const mapped = mapRouterError(raw404);

      assert.strictEqual(mapped.errorCode, 'UNSUPPORTED_VERSION');
      assert.match(mapped.errorMessage, /RouterOS v7/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. RouterOS Uptime Parser Tests
  // --------------------------------------------------------------------------
  describe('3. RouterOS Uptime String Parsing', () => {
    it('should parse compound weeks, days, and hh:mm:ss (1w2d03:04:05)', () => {
      const parsed = parseRouterOsUptime('1w2d03:04:05');
      // 1w (604800) + 2d (172800) + 3h (10800) + 4m (240) + 5s = 788645
      assert.strictEqual(parsed, 788645);
    });

    it('should parse days and hh:mm:ss (2d04:12:30)', () => {
      const parsed = parseRouterOsUptime('2d04:12:30');
      // 2d (172800) + 4h (14400) + 12m (720) + 30s = 187950
      assert.strictEqual(parsed, 187950);
    });

    it('should parse simple hh:mm:ss (04:12:30)', () => {
      const parsed = parseRouterOsUptime('04:12:30');
      // 4h (14400) + 12m (720) + 30s = 15150
      assert.strictEqual(parsed, 15150);
    });

    it('should parse shorthand letter durations (35m12s)', () => {
      const parsed = parseRouterOsUptime('35m12s');
      // 35*60 + 12 = 2112
      assert.strictEqual(parsed, 2112);
    });

    it('should parse seconds-only and numeric inputs', () => {
      assert.strictEqual(parseRouterOsUptime('45s'), 45);
      assert.strictEqual(parseRouterOsUptime(120), 120);
      assert.strictEqual(parseRouterOsUptime(''), 0);
      assert.strictEqual(parseRouterOsUptime(null), 0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Strict Read-Only Safety Locks (Phase 1)
  // --------------------------------------------------------------------------
  describe('4. Phase 1 Safety Locks (Strict Read-Only)', () => {
    const dummyCreds = {
      host: '1.1.1.1',
      port: 8729,
      username: 'admin',
      password: 'password123',
    };

    it('should strictly reject createHotspotUser with READ_ONLY_PHASE_1', async () => {
      const res = await connector.createHotspotUser(dummyCreds, 'user1', 'pass1', 'default');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'READ_ONLY_PHASE_1');
      assert.match(res.errorMessage, /محظور في المرحلة الأولى/);
    });

    it('should strictly reject disableHotspotUser with READ_ONLY_PHASE_1', async () => {
      const res = await connector.disableHotspotUser(dummyCreds, 'user1');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'READ_ONLY_PHASE_1');
    });

    it('should strictly reject disconnectActiveSession with READ_ONLY_PHASE_1', async () => {
      const res = await connector.disconnectActiveSession(dummyCreds, 'user1');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'READ_ONLY_PHASE_1');
    });

    it('should strictly reject getHotspotUsers with READ_ONLY_PHASE_1', async () => {
      const res = await connector.getHotspotUsers(dummyCreds);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'READ_ONLY_PHASE_1');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Port Conflict & Security Pre-Checks
  // --------------------------------------------------------------------------
  describe('5. Port Conflict & Security Pre-Checks', () => {
    it('should reject attempting ROUTEROS_API_SSL over unencrypted port 8728', async () => {
      const res = await connector.testConnection({
        host: '1.1.1.1',
        port: 8728,
        username: 'admin',
        password: 'password',
        connectionMethod: 'ROUTEROS_API_SSL',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'INVALID_PORT_CONFIGURATION');
      assert.match(res.errorMessage, /تعارض أمني.*8728/);
    });

    it('should strictly block unencrypted binary API (8728) over public Internet', async () => {
      const res = await connector.testConnection({
        host: '8.8.8.8',
        port: 8728,
        username: 'admin',
        password: 'password',
        connectionMethod: 'ROUTEROS_API_PLAIN',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'UNENCRYPTED_CONNECTION_BLOCKED');
      assert.match(res.errorMessage, /محظور أمنياً: لا يُسمح بإجراء اتصالات غير مشفرة/);
    });

    it('should strictly block unencrypted REST API (80) over public Internet', async () => {
      const res = await connector.testConnection({
        host: '8.8.8.8',
        port: 80,
        username: 'admin',
        password: 'password',
        connectionMethod: 'REST_API_PLAIN',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'UNENCRYPTED_CONNECTION_BLOCKED');
      assert.match(res.errorMessage, /محظور أمنياً: لا يُسمح بإجراء اتصالات غير مشفرة/);
    });

    it('should reject malformed TLS certificate fingerprint', async () => {
      const res = await connector.testConnection({
        host: '8.8.8.8',
        port: 8729,
        username: 'admin',
        password: 'password',
        connectionMethod: 'ROUTEROS_API_SSL',
        certificateFingerprint: 'invalid_short_fingerprint',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'INVALID_FINGERPRINT_FORMAT');
      assert.match(res.errorMessage, /بصمة الشهادة المدخلة غير صالحة/);
    });
  });

  // --------------------------------------------------------------------------
  // 6. End-to-End Diagnostic Query via Real REST Client Mock Server
  // --------------------------------------------------------------------------
  describe('6. Real Protocol Query Execution (REST Client)', () => {
    let mockServer: http.Server;
    let mockPort: number;

    beforeEach(async () => {
      mockServer = http.createServer((req, res) => {
        const url = req.url || '';
        const authHeader = req.headers.authorization || '';

        // Verify Basic Auth format (Rule 14)
        if (!authHeader.startsWith('Basic ')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 401, message: 'Unauthorized' }));
        }

        if (url === '/rest/system/identity') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ name: 'Jalsah-HQ-Router' }));
        }

        if (url === '/rest/system/resource') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              uptime: '3d05:22:10',
              version: '7.12.1 (stable)',
              'cpu-load': '12',
              'board-name': 'RB4011iGS+',
              'architecture-name': 'arm',
              'free-memory': 854302720,
              'total-memory': 1073741824,
            })
          );
        }

        if (url === '/rest/system/routerboard') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ routerboard: true, model: 'RB4011iGS+' }));
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 404, message: 'Not found' }));
      });

      await new Promise<void>((resolve) => {
        mockServer.listen(0, '127.0.0.1', () => {
          mockPort = (mockServer.address() as any).port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    });

    it('should successfully read RouterInfo specifications and cleanly teardown connection', async () => {
      const restClient = new MikroTikRestClient();
      const info = await restClient.testAndReadInfo(
        {
          host: '127.0.0.1',
          port: mockPort,
          username: 'admin',
          password: 'secure_password_test',
          connectionMethod: 'REST_API_PLAIN',
        },
        5000
      );

      assert.strictEqual(info.identity, 'Jalsah-HQ-Router');
      assert.strictEqual(info.boardName, 'RB4011iGS+');
      assert.strictEqual(info.model, 'RB4011iGS+');
      assert.strictEqual(info.version, 'RouterOS 7.12.1 (stable)');
      assert.strictEqual(info.cpuLoad, 12);
      assert.strictEqual(info.architectureName, 'arm');
      assert.strictEqual(info.freeMemoryBytes, 854302720);
      assert.strictEqual(info.totalMemoryBytes, 1073741824);
      // 3d (259200) + 5h (18000) + 22m (1320) + 10s = 278530
      assert.strictEqual(info.uptimeSeconds, 278530);
    });

    it('should accurately handle HTTP 401 unauthorized in REST client', async () => {
      // Create server that returns 401
      const unauthServer = http.createServer((_req, res) => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 401, message: 'Unauthorized' }));
      });

      const unauthPort = await new Promise<number>((resolve) => {
        unauthServer.listen(0, '127.0.0.1', () => {
          resolve((unauthServer.address() as any).port);
        });
      });

      try {
        const restClient = new MikroTikRestClient();
        await assert.rejects(
          async () => {
            await restClient.testAndReadInfo(
              {
                host: '127.0.0.1',
                port: unauthPort,
                username: 'wrong_user',
                password: 'wrong_password',
                connectionMethod: 'REST_API_PLAIN',
              },
              3000
            );
          },
          (err: any) => {
            const mapped = mapRouterError(err);
            assert.strictEqual(mapped.errorCode, 'AUTHENTICATION_FAILED');
            return true;
          }
        );
      } finally {
        unauthServer.close();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 7. Unified Total Timeout & AbortSignal Cancellation
  // --------------------------------------------------------------------------
  describe('7. Unified Total Timeout & AbortSignal Cancellation', () => {
    it('should abort immediately when AbortSignal is already aborted', async () => {
      const ac = new AbortController();
      ac.abort();

      const res = await connector.testConnection(
        {
          host: '1.1.1.1',
          port: 8729,
          username: 'admin',
          password: 'password',
          connectionMethod: 'ROUTEROS_API_SSL',
        },
        5000,
        ac.signal
      );

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'CLIENT_ABORTED');
      assert.match(res.errorMessage, /تم إلغاء عملية الفحص/);
    });

    it('should cancel DNS resolution when AbortSignal triggers', async () => {
      const ac = new AbortController();
      const promise = SsrfProtection.validateTarget('nonexistent-domain-test.local', false, 5000, ac.signal);
      ac.abort();
      const res = await promise;
      assert.strictEqual(res.isAllowed, false);
    });

    it('should enforce total timeout and terminate without completing subsequent queries', async () => {
      let queryCount = 0;
      const slowServer = http.createServer(async (req, res) => {
        queryCount++;
        // Delay response to simulate a sluggish router
        await new Promise((resolve) => setTimeout(resolve, 800));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: 'SlowRouter' }));
      });

      const slowPort = await new Promise<number>((resolve) => {
        slowServer.listen(0, '127.0.0.1', () => {
          resolve((slowServer.address() as any).port);
        });
      });

      try {
        const restClient = new MikroTikRestClient();
        // Give 500ms total timeout; first query takes 800ms
        await assert.rejects(
          async () => {
            await restClient.testAndReadInfo(
              {
                host: '127.0.0.1',
                port: slowPort,
                username: 'admin',
                password: 'password',
                connectionMethod: 'REST_API_PLAIN',
              },
              500
            );
          },
          (err: any) => {
            assert.strictEqual(err.code, 'TIMEOUT');
            return true;
          }
        );
      } finally {
        slowServer.close();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 8. RouterRateLimiter Process-Level Sliding Window & Concurrency
  // --------------------------------------------------------------------------
  describe('8. RouterRateLimiter Tests', () => {
    it('should allow requests within rate limit', async () => {
      const { RouterRateLimiter } = await import(
        '../../src/infrastructure/security/RouterRateLimiter.js'
      );
      const limiter = new RouterRateLimiter(3, 60000, 2);
      const tenant = 't-test-1';

      const r1 = limiter.acquire(tenant);
      assert.strictEqual(r1.allowed, true);
      limiter.release(tenant);

      const r2 = limiter.acquire(tenant);
      assert.strictEqual(r2.allowed, true);
      limiter.release(tenant);
    });

    it('should reject requests exceeding max requests per window with 429 Retry-After', async () => {
      const { RouterRateLimiter } = await import(
        '../../src/infrastructure/security/RouterRateLimiter.js'
      );
      const limiter = new RouterRateLimiter(2, 60000, 5);
      const tenant = 't-test-limit';

      const r1 = limiter.acquire(tenant);
      assert.strictEqual(r1.allowed, true);
      limiter.release(tenant);

      const r2 = limiter.acquire(tenant);
      assert.strictEqual(r2.allowed, true);
      limiter.release(tenant);

      // Third request exceeds limit
      const r3 = limiter.acquire(tenant);
      assert.strictEqual(r3.allowed, false);
      assert.ok(r3.retryAfterSeconds && r3.retryAfterSeconds > 0);
      assert.match(r3.reason || '', /تم تجاوز الحد الأقصى/);
    });

    it('should reject requests exceeding max concurrent in-flight probes', async () => {
      const { RouterRateLimiter } = await import(
        '../../src/infrastructure/security/RouterRateLimiter.js'
      );
      const limiter = new RouterRateLimiter(10, 60000, 1);
      const tenant = 't-test-concurrent';

      const r1 = limiter.acquire(tenant);
      assert.strictEqual(r1.allowed, true);

      // Without releasing, second concurrent request is blocked
      const r2 = limiter.acquire(tenant);
      assert.strictEqual(r2.allowed, false);
      assert.match(r2.reason || '', /يوجد فحص اتصال قيد التشغيل بالفعل/);

      // After release, new request succeeds
      limiter.release(tenant);
      const r3 = limiter.acquire(tenant);
      assert.strictEqual(r3.allowed, true);
      limiter.release(tenant);
    });

    it('should maintain strict tenant isolation in rate limiter', async () => {
      const { RouterRateLimiter } = await import(
        '../../src/infrastructure/security/RouterRateLimiter.js'
      );
      const limiter = new RouterRateLimiter(1, 60000, 1);
      const tenantA = 'tenant-alpha';
      const tenantB = 'tenant-beta';

      // Exhaust Tenant A's limit
      const rA1 = limiter.acquire(tenantA);
      assert.strictEqual(rA1.allowed, true);
      limiter.release(tenantA);

      const rA2 = limiter.acquire(tenantA);
      assert.strictEqual(rA2.allowed, false);

      // Tenant B must not be affected
      const rB1 = limiter.acquire(tenantB);
      assert.strictEqual(rB1.allowed, true);
      limiter.release(tenantB);
    });
  });
});

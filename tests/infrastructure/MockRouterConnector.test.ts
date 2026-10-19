// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/infrastructure/MockRouterConnector.test.ts
// Unit Tests: MockRouterConnector Interface and Behavior Verification
// Test Runner: Node.js Built-in Test Runner via tsx
// ============================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MockRouterConnector } from '../../src/infrastructure/mikrotik/adapters/MockRouterConnector.js';
import { RouterCredentialsInput } from '../../src/application/interfaces/IRouterConnector.js';

describe('MockRouterConnector Infrastructure Unit Tests', () => {
  let connector: MockRouterConnector;

  const validCreds: RouterCredentialsInput = {
    host: '192.168.88.1',
    port: 8728,
    username: 'admin',
    password: 'secure_password_123',
  };

  const failingCreds: RouterCredentialsInput = {
    host: 'fail.test',
    port: 8728,
    username: 'admin',
    password: 'wrong_password',
  };

  beforeEach(() => {
    connector = new MockRouterConnector();
  });

  describe('1. Connection Testing (testConnection)', () => {
    it('should successfully test connection to a valid router host', async () => {
      const result = await connector.testConnection(validCreds);

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.identity, 'MOCK-ROUTER-01');
        assert.equal(result.data.version, 'RouterOS v7.14.3');
        assert.equal(result.data.boardName, 'RB4011iGS+');
        assert.equal(typeof result.data.cpuLoad, 'number');
        assert.equal(typeof result.data.uptimeSeconds, 'number');
      }
    });

    it('should return connection failure Result when host is fail.test', async () => {
      const result = await connector.testConnection(failingCreds);

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.errorCode, 'CONNECTION_REFUSED');
        assert.match(result.errorMessage, /Connection refused/);
      }
    });
  });

  describe('2. Router Info Retrieval (getRouterInfo)', () => {
    it('should return router information for a reachable host', async () => {
      const result = await connector.getRouterInfo(validCreds);

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.identity, 'MOCK-ROUTER-01');
        assert.equal(result.data.boardName, 'RB4011iGS+');
      }
    });

    it('should fail router info retrieval for fail.test', async () => {
      const result = await connector.getRouterInfo(failingCreds);

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.errorCode, 'CONNECTION_REFUSED');
      }
    });
  });

  describe('3. Hotspot Users Management (getHotspotUsers & createHotspotUser)', () => {
    it('should retrieve existing hotspot users with valid schema shape', async () => {
      const result = await connector.getHotspotUsers(validCreds);

      assert.equal(result.success, true);
      if (result.success) {
        assert.ok(Array.isArray(result.data));
        assert.ok(result.data.length >= 2);
        const first = result.data[0];
        assert.ok(first);
        assert.equal(typeof first.username, 'string');
        assert.equal(typeof first.profile, 'string');
        assert.equal(typeof first.isEnabled, 'boolean');
      }
    });

    it('should successfully create a new hotspot user and verify existence', async () => {
      const createResult = await connector.createHotspotUser(
        validCreds,
        'voucher_test_user',
        'card_secret_pass',
        '2hours_profile'
      );

      assert.equal(createResult.success, true);

      // Verify that user now appears in list
      const listResult = await connector.getHotspotUsers(validCreds);
      assert.equal(listResult.success, true);
      if (listResult.success) {
        const found = listResult.data.find((u) => u.username === 'voucher_test_user');
        assert.ok(found);
        assert.equal(found.profile, '2hours_profile');
        assert.equal(found.isEnabled, true);
      }
    });

    it('should fail getHotspotUsers for fail.test', async () => {
      const result = await connector.getHotspotUsers(failingCreds);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.errorCode, 'CONNECTION_REFUSED');
      }
    });
  });

  describe('4. User Disabling & Session Disconnection', () => {
    it('should disable an existing hotspot user', async () => {
      const disableResult = await connector.disableHotspotUser(validCreds, 'mock_user_1');

      assert.equal(disableResult.success, true);

      const listResult = await connector.getHotspotUsers(validCreds);
      assert.equal(listResult.success, true);
      if (listResult.success) {
        const user = listResult.data.find((u) => u.username === 'mock_user_1');
        assert.ok(user);
        assert.equal(user.isEnabled, false);
      }
    });

    it('should disconnect an active user session successfully', async () => {
      const disconnectResult = await connector.disconnectActiveSession(validCreds, 'mock_user_1');

      assert.equal(disconnectResult.success, true);
    });

    it('should fail disableHotspotUser and disconnectActiveSession for fail.test', async () => {
      const disableRes = await connector.disableHotspotUser(failingCreds, 'mock_user_1');
      assert.equal(disableRes.success, false);
      if (!disableRes.success) {
        assert.equal(disableRes.errorCode, 'CONNECTION_REFUSED');
      }

      const disconnectRes = await connector.disconnectActiveSession(failingCreds, 'mock_user_1');
      assert.equal(disconnectRes.success, false);
      if (!disconnectRes.success) {
        assert.equal(disconnectRes.errorCode, 'CONNECTION_REFUSED');
      }
    });
  });
});

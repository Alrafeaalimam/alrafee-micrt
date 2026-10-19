// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/application/TestRouterConnectionUseCase.test.ts
// Unit Tests: TestRouterConnectionUseCase Application Layer Verification
// Test Runner: Node.js Built-in Test Runner via tsx
// Master Reference: Rule 16 (Clean Architecture Layers - DIP)
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestRouterConnectionUseCase } from '../../src/application/use-cases/routers/TestRouterConnectionUseCase.js';
import { MockRouterConnector } from '../../src/infrastructure/mikrotik/adapters/MockRouterConnector.js';
import {
  IRouterConnector,
  RouterCredentialsInput,
  RouterConnectorResult,
  RouterInfo,
} from '../../src/application/interfaces/IRouterConnector.js';

describe('TestRouterConnectionUseCase Application Unit Tests', () => {
  const validCreds: RouterCredentialsInput = {
    host: '10.0.0.1',
    port: 8728,
    username: 'admin',
    password: 'super_secret_password',
  };

  const failingCreds: RouterCredentialsInput = {
    host: 'fail.test',
    port: 8728,
    username: 'admin',
    password: 'invalid_password',
  };

  describe('1. Execution with MockRouterConnector Adapter', () => {
    it('should successfully execute and return RouterInfo for normal host', async () => {
      const mockConnector = new MockRouterConnector();
      const useCase = new TestRouterConnectionUseCase(mockConnector);

      const result = await useCase.execute(validCreds);

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.identity, 'MOCK-ROUTER-01');
        assert.equal(result.data.version, 'RouterOS v7.14.3');
        assert.equal(result.data.boardName, 'RB4011iGS+');
        assert.equal(result.data.cpuLoad, 8);
        assert.equal(result.data.uptimeSeconds, 86400);
      }
    });

    it('should return failure Result when host is fail.test', async () => {
      const mockConnector = new MockRouterConnector();
      const useCase = new TestRouterConnectionUseCase(mockConnector);

      const result = await useCase.execute(failingCreds);

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.errorCode, 'CONNECTION_REFUSED');
        assert.match(result.errorMessage, /Connection refused/);
      }
    });
  });

  describe('2. Dependency Inversion Principle (DIP) Verification', () => {
    it('should work with any arbitrary IRouterConnector implementation without modification', async () => {
      let passedTimeout: number | undefined;

      // Custom inline stub satisfying IRouterConnector
      const customStubConnector: IRouterConnector = {
        async testConnection(
          _creds: RouterCredentialsInput,
          timeoutMs?: number
        ): Promise<RouterConnectorResult<RouterInfo>> {
          passedTimeout = timeoutMs;
          return {
            success: true,
            data: {
              identity: 'CUSTOM-CHR-STUB',
              version: 'v7.15',
              boardName: 'CHR',
              cpuLoad: 2,
              uptimeSeconds: 1200,
            },
          };
        },
        async getRouterInfo(): Promise<RouterConnectorResult<RouterInfo>> {
          throw new Error('Not implemented');
        },
        async getHotspotUsers() {
          throw new Error('Not implemented');
        },
        async createHotspotUser() {
          throw new Error('Not implemented');
        },
        async disableHotspotUser() {
          throw new Error('Not implemented');
        },
        async disconnectActiveSession() {
          throw new Error('Not implemented');
        },
      };

      const useCase = new TestRouterConnectionUseCase(customStubConnector);
      const result = await useCase.execute(validCreds, 5000);

      assert.equal(passedTimeout, 5000);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.identity, 'CUSTOM-CHR-STUB');
        assert.equal(result.data.boardName, 'CHR');
      }
    });
  });
});

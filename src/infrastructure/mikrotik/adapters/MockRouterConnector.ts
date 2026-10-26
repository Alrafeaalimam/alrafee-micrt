// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/mikrotik/adapters/MockRouterConnector.ts
// Adapter: Simulated In-Memory MikroTik Connector
// Master Reference: Rule 5 (Router Connector Abstraction), Rule 23 (Error Handling)
// ============================================================================

import {
  IRouterConnector,
  RouterCredentialsInput,
  RouterConnectorResult,
  RouterInfo,
  HotspotUser,
  HotspotSession,
  CreateHotspotUserOptions,
} from '../../../application/interfaces/IRouterConnector.js';

export class MockRouterConnector implements IRouterConnector {
  private readonly hotspotUsersMap: Map<string, HotspotUser & {
    password?: string;
    rateLimit?: string | undefined;
    limitUptimeSeconds?: number | undefined;
    limitBytesTotal?: number | bigint | undefined;
  }> = new Map([
    ['mock_user_1', { username: 'mock_user_1', profile: 'default', isEnabled: true, uptimeSeconds: 3600, bytesIn: BigInt(5242880), bytesOut: BigInt(20971520), comment: 'test' }],
    ['mock_user_2', { username: 'mock_user_2', profile: 'vip', isEnabled: true, uptimeSeconds: 1200, bytesIn: BigInt(1048576), bytesOut: BigInt(4194304), comment: 'test' }],
  ]);

  private readonly activeSessions: Map<string, HotspotSession> = new Map([
    ['mock_user_1', { id: '*1', username: 'mock_user_1', ipAddress: '192.168.88.245', macAddress: '00:11:22:33:44:55', uptimeSeconds: 120, bytesIn: BigInt(1048576), bytesOut: BigInt(5242880) }],
  ]);

  private checkFailureCondition(creds: RouterCredentialsInput): RouterConnectorResult<never> | null {
    if (creds.host === 'fail.test') {
      return {
        success: false,
        errorCode: 'CONNECTION_REFUSED',
        errorMessage: `Connection refused: unable to reach host '${creds.host}' on port ${creds.port}`,
      };
    }
    return null;
  }

  public async testConnection(
    creds: RouterCredentialsInput,
    _timeoutMs?: number
  ): Promise<RouterConnectorResult<RouterInfo>> {
    const failure = this.checkFailureCondition(creds);
    if (failure) return failure;

    return {
      success: true,
      data: {
        identity: 'MOCK-ROUTER-01',
        version: 'RouterOS v7.14.3',
        boardName: 'RB4011iGS+',
        cpuLoad: 8,
        uptimeSeconds: 86400,
      },
    };
  }

  public async getRouterInfo(
    creds: RouterCredentialsInput,
    _timeoutMs?: number
  ): Promise<RouterConnectorResult<RouterInfo>> {
    const failure = this.checkFailureCondition(creds);
    if (failure) return failure;

    return {
      success: true,
      data: {
        identity: 'MOCK-ROUTER-01',
        version: 'RouterOS v7.14.3',
        boardName: 'RB4011iGS+',
        cpuLoad: 8,
        uptimeSeconds: 86400,
      },
    };
  }

  public async getHotspotUsers(
    creds: RouterCredentialsInput,
    _timeoutMs?: number
  ): Promise<RouterConnectorResult<HotspotUser[]>> {
    const failure = this.checkFailureCondition(creds);
    if (failure) return failure;

    return {
      success: true,
      data: Array.from(this.hotspotUsersMap.values()),
    };
  }

  public async getHotspotActiveSessions(
    creds: RouterCredentialsInput,
    _timeoutMs?: number
  ): Promise<RouterConnectorResult<HotspotSession[]>> {
    const failure = this.checkFailureCondition(creds);
    if (failure) return failure;

    return {
      success: true,
      data: Array.from(this.activeSessions.values()),
    };
  }

  public async createHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    password: string,
    profile: string,
    options?: CreateHotspotUserOptions,
    _timeoutMs?: number
  ): Promise<RouterConnectorResult<void>> {
    const failure = this.checkFailureCondition(creds);
    if (failure) return failure;

    this.hotspotUsersMap.set(username, {
      username,
      profile,
      isEnabled: true,
      password,
      uptimeSeconds: 0,
      bytesIn: BigInt(0),
      bytesOut: BigInt(0),
      comment: options?.comment,
      rateLimit: options?.rateLimit,
      limitUptimeSeconds: options?.limitUptimeSeconds,
      limitBytesTotal: options?.limitBytesTotal,
    });

    return {
      success: true,
      data: undefined,
    };
  }

  public async enableHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    _timeoutMs?: number
  ): Promise<RouterConnectorResult<void>> {
    const failure = this.checkFailureCondition(creds);
    if (failure) return failure;

    const existing = this.hotspotUsersMap.get(username);
    if (existing) {
      this.hotspotUsersMap.set(username, {
        ...existing,
        isEnabled: true,
      });
    }

    return {
      success: true,
      data: undefined,
    };
  }

  public async disableHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    _timeoutMs?: number
  ): Promise<RouterConnectorResult<void>> {
    const failure = this.checkFailureCondition(creds);
    if (failure) return failure;

    const existing = this.hotspotUsersMap.get(username);
    if (existing) {
      this.hotspotUsersMap.set(username, {
        ...existing,
        isEnabled: false,
      });
    }

    return {
      success: true,
      data: undefined,
    };
  }

  public async disconnectActiveSession(
    creds: RouterCredentialsInput,
    username: string,
    _timeoutMs?: number
  ): Promise<RouterConnectorResult<void>> {
    const failure = this.checkFailureCondition(creds);
    if (failure) return failure;

    this.activeSessions.delete(username);

    return {
      success: true,
      data: undefined,
    };
  }
}

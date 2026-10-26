// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/interfaces/IRouterConnector.ts
// Port / Contract: Router Connector Abstraction
// Master Reference: Rule 5 (Router Connector Abstraction), Rule 11 (Source of Truth), Rule 23 (Error Handling)
// Pure Contract - Zero External / Execution Logic
// ============================================================================

export type RouterConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'TIMEOUT' | 'ERROR';

export interface RouterInfo {
  readonly identity: string;
  readonly version: string;
  readonly boardName: string;
  readonly cpuLoad: number;
  readonly uptimeSeconds: number;
  readonly model?: string | undefined;
  readonly architectureName?: string | undefined;
  readonly freeMemoryBytes?: number | undefined;
  readonly totalMemoryBytes?: number | undefined;
}

export interface RouterCredentialsInput {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly connectionMethod?:
    | 'ROUTEROS_API_SSL'
    | 'ROUTEROS_API_PLAIN'
    | 'REST_API_HTTPS'
    | 'REST_API_PLAIN'
    | 'SSH_TUNNEL'
    | undefined;
  readonly caCertificate?: string | undefined;
  readonly certificateFingerprint?: string | undefined;
  readonly tlsRejectUnauthorized?: boolean | undefined;
}

export interface HotspotUser {
  readonly username: string;
  readonly profile: string;
  readonly isEnabled: boolean;
  readonly uptimeSeconds?: number | undefined;
  readonly bytesIn?: number | bigint | undefined;
  readonly bytesOut?: number | bigint | undefined;
  readonly comment?: string | undefined;
}

export interface HotspotSession {
  readonly id?: string | undefined;
  readonly username: string;
  readonly ipAddress?: string | undefined;
  readonly macAddress?: string | undefined;
  readonly uptimeSeconds?: number | undefined;
  readonly bytesIn?: number | bigint | undefined;
  readonly bytesOut?: number | bigint | undefined;
}

export interface CreateHotspotUserOptions {
  readonly limitUptimeSeconds?: number | undefined;
  readonly limitBytesTotal?: number | bigint | undefined;
  readonly rateLimit?: string | undefined;
  readonly comment?: string | undefined;
}

/**
 * Result Type Pattern (Rule 23 - Error Handling):
 * Network failures and router rejections are expected operational outcomes,
 * not unhandled system exceptions.
 */
export type RouterConnectorResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly errorCode: string; readonly errorMessage: string };

/**
 * Abstract Port for MikroTik RouterOS Communication.
 * Decouples domain and application use-cases from specific communication drivers (API/REST/SSH).
 */
export interface IRouterConnector {
  testConnection(
    creds: RouterCredentialsInput,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<RouterConnectorResult<RouterInfo>>;

  getRouterInfo(
    creds: RouterCredentialsInput,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<RouterConnectorResult<RouterInfo>>;

  getHotspotUsers(
    creds: RouterCredentialsInput,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<HotspotUser[]>>;

  getHotspotActiveSessions(
    creds: RouterCredentialsInput,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<HotspotSession[]>>;

  createHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    password: string,
    profile: string,
    options?: CreateHotspotUserOptions,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<void>>;

  enableHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<void>>;

  disableHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<void>>;

  disconnectActiveSession(
    creds: RouterCredentialsInput,
    username: string,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<void>>;
}

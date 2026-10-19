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
}

export interface RouterCredentialsInput {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
}

export interface HotspotUser {
  readonly username: string;
  readonly profile: string;
  readonly isEnabled: boolean;
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
    timeoutMs?: number
  ): Promise<RouterConnectorResult<RouterInfo>>;

  getRouterInfo(
    creds: RouterCredentialsInput,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<RouterInfo>>;

  getHotspotUsers(
    creds: RouterCredentialsInput,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<HotspotUser[]>>;

  createHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    password: string,
    profile: string,
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

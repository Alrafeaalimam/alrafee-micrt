// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/mikrotik/adapters/RealRouterConnector.ts
// Adapter: Real Production MikroTik Connector (Read-Only for Phase 1)
// Master Reference: Rule 5 (Router Connector), Rule 14 (Security), Rule 23 (Errors)
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
import { SsrfProtection } from '../../security/SsrfProtection.js';
import { MikroTikBinaryApiClient } from './MikroTikBinaryApiClient.js';
import { MikroTikRestClient } from './MikroTikRestClient.js';
import { mapRouterError } from './MikroTikErrorMapper.js';

export class RealRouterConnector implements IRouterConnector {
  private readonly binaryClient: MikroTikBinaryApiClient;
  private readonly restClient: MikroTikRestClient;
  private readonly allowMutations: boolean;
  private readonly allowPrivateIps: boolean;

  constructor(options?: { allowMutations?: boolean; allowPrivateIps?: boolean }) {
    this.binaryClient = new MikroTikBinaryApiClient();
    this.restClient = new MikroTikRestClient();
    this.allowMutations = options?.allowMutations ?? (process.env.ENABLE_ROUTER_MUTATIONS === 'true');
    this.allowPrivateIps = options?.allowPrivateIps ?? (process.env.ALLOW_PRIVATE_ROUTER_IPS === 'true');
  }

  /**
   * Tests connectivity and retrieves live router specifications using real protocol adapters.
   */
  public async testConnection(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    signal?: AbortSignal
  ): Promise<RouterConnectorResult<RouterInfo>> {
    if (signal?.aborted) {
      return {
        success: false,
        errorCode: 'CLIENT_ABORTED',
        errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
      };
    }

    const deadline = Date.now() + timeoutMs;

    // 1. SSRF Protection & Target Validation
    const dnsTimeout = Math.min(3000, Math.max(500, deadline - Date.now()));
    const ssrfCheck = await SsrfProtection.validateTarget(creds.host, this.allowPrivateIps, dnsTimeout, signal);
    if (!ssrfCheck.isAllowed) {
      if (signal?.aborted || ssrfCheck.reason?.includes('Client Aborted')) {
        return {
          success: false,
          errorCode: 'CLIENT_ABORTED',
          errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
        };
      }
      if (ssrfCheck.reason?.includes('DNS Resolution Timeout')) {
        return {
          success: false,
          errorCode: 'DNS_TIMEOUT',
          errorMessage: ssrfCheck.reason,
        };
      }
      return {
        success: false,
        errorCode: 'SSRF_BLOCKED',
        errorMessage: ssrfCheck.reason || 'محاولة اتصال محظورة أمنياً (SSRF Protection)',
      };
    }

    // Check remaining timeout after DNS
    const remainingAfterDns = deadline - Date.now();
    if (remainingAfterDns <= 200) {
      return {
        success: false,
        errorCode: 'TIMEOUT',
        errorMessage: `انتهت المهلة الزمنية الكلية المحددة للاتصال بالراوتر (${timeoutMs}ms).`,
      };
    }

    // 2. Protocol Selection
    const isRest =
      creds.connectionMethod === 'REST_API_HTTPS' ||
      creds.connectionMethod === 'REST_API_PLAIN' ||
      ((creds.port === 443 || creds.port === 80) && creds.connectionMethod !== 'ROUTEROS_API_SSL');

    // 2b. Port Configuration Conflict: API-SSL cannot run on plain port 8728
    if (creds.port === 8728 && creds.connectionMethod === 'ROUTEROS_API_SSL') {
      return {
        success: false,
        errorCode: 'INVALID_PORT_CONFIGURATION',
        errorMessage:
          'تعارض أمني: لا يمكن استخدام اتصال مشفر (TLS / API-SSL) عبر منفذ 8728 غير المشفر. استخدم منفذ 8729 المخصص لـ API-SSL.',
      };
    }

    // 3. Strict Security: Block unencrypted communication over public Internet (Rule 14, Phase B.5)
    const isPublicInternet = ssrfCheck.isPrivate === false;
    const isUnencryptedRest = isRest && (creds.port === 80 || creds.connectionMethod === 'REST_API_PLAIN');
    const isUnencryptedBinary = !isRest && (creds.port === 8728 || creds.connectionMethod === 'ROUTEROS_API_PLAIN');

    if (isPublicInternet && (isUnencryptedRest || isUnencryptedBinary)) {
      return {
        success: false,
        errorCode: 'UNENCRYPTED_CONNECTION_BLOCKED',
        errorMessage:
          'محظور أمنياً: لا يُسمح بإجراء اتصالات غير مشفرة (HTTP أو API غير المشفر 8728) عبر شبكة الإنترنت العامة. يجب استخدام بروتوكول مشفر (API-SSL المنفذ 8729 أو REST HTTPS المنفذ 443) لحماية بيانات الاعتماد من التنصت.',
      };
    }

    try {
      let routerInfo: RouterInfo;
      const remainingTime = Math.max(500, deadline - Date.now());

      // Pass ssrfCheck.resolvedIp to eliminate DNS Rebinding (TOCTOU)
      if (isRest) {
        routerInfo = await this.restClient.testAndReadInfo(creds, remainingTime, ssrfCheck.resolvedIp, signal);
      } else {
        routerInfo = await this.binaryClient.testAndReadInfo(creds, remainingTime, ssrfCheck.resolvedIp, signal);
      }

      if (signal?.aborted) {
        return {
          success: false,
          errorCode: 'CLIENT_ABORTED',
          errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
        };
      }

      return {
        success: true,
        data: routerInfo,
      };
    } catch (rawError: any) {
      if (signal?.aborted || rawError.code === 'CLIENT_ABORTED') {
        return {
          success: false,
          errorCode: 'CLIENT_ABORTED',
          errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
        };
      }
      const mapped = mapRouterError(rawError);
      return {
        success: false,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      };
    }
  }

  public async getRouterInfo(
    creds: RouterCredentialsInput,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<RouterConnectorResult<RouterInfo>> {
    return this.testConnection(creds, timeoutMs, signal);
  }

  // --------------------------------------------------------------------------
  // HotSpot Operations - Live Provisioning & Session Control
  // --------------------------------------------------------------------------

  private async prepareConnection(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    signal?: AbortSignal
  ): Promise<
    | { success: true; isRest: boolean; resolvedIp: string | undefined; deadline: number }
    | { success: false; errorCode: string; errorMessage: string }
  > {
    if (signal?.aborted) {
      return {
        success: false,
        errorCode: 'CLIENT_ABORTED',
        errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
      };
    }

    const deadline = Date.now() + timeoutMs;
    const dnsTimeout = Math.min(3000, Math.max(500, deadline - Date.now()));
    const ssrfCheck = await SsrfProtection.validateTarget(creds.host, this.allowPrivateIps, dnsTimeout, signal);

    if (!ssrfCheck.isAllowed) {
      if (signal?.aborted || ssrfCheck.reason?.includes('Client Aborted')) {
        return {
          success: false,
          errorCode: 'CLIENT_ABORTED',
          errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
        };
      }
      return {
        success: false,
        errorCode: 'SSRF_BLOCKED',
        errorMessage: ssrfCheck.reason || 'محاولة اتصال محظورة أمنياً (SSRF Protection)',
      };
    }

    const isRest =
      creds.connectionMethod === 'REST_API_HTTPS' ||
      creds.connectionMethod === 'REST_API_PLAIN' ||
      ((creds.port === 443 || creds.port === 80) && creds.connectionMethod !== 'ROUTEROS_API_SSL');

    if (creds.port === 8728 && creds.connectionMethod === 'ROUTEROS_API_SSL') {
      return {
        success: false,
        errorCode: 'INVALID_PORT_CONFIGURATION',
        errorMessage: 'تعارض أمني: لا يمكن استخدام اتصال مشفر (TLS / API-SSL) عبر منفذ 8728 غير المشفر. استخدم منفذ 8729 المخصص لـ API-SSL.',
      };
    }

    const isPublicInternet = ssrfCheck.isPrivate === false;
    const isUnencryptedRest = isRest && (creds.port === 80 || creds.connectionMethod === 'REST_API_PLAIN');
    const isUnencryptedBinary = !isRest && (creds.port === 8728 || creds.connectionMethod === 'ROUTEROS_API_PLAIN');

    if (isPublicInternet && (isUnencryptedRest || isUnencryptedBinary)) {
      return {
        success: false,
        errorCode: 'UNENCRYPTED_CONNECTION_BLOCKED',
        errorMessage: 'محظور أمنياً: لا يُسمح بإجراء اتصالات غير مشفرة عبر شبكة الإنترنت العامة.',
      };
    }

    return {
      success: true,
      isRest,
      resolvedIp: ssrfCheck.resolvedIp,
      deadline,
    };
  }

  public async getHotspotUsers(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000
  ): Promise<RouterConnectorResult<HotspotUser[]>> {
    if (!this.allowMutations) {
      return {
        success: false,
        errorCode: 'READ_ONLY_PHASE_1',
        errorMessage: 'محظور في المرحلة الأولى: جلب مستخدمي الهوتسبوت غير مفعل دون تفعيل صلاحيات الراوتر.',
      };
    }
    const prep = await this.prepareConnection(creds, timeoutMs);
    if (!prep.success) return prep;

    try {
      const remainingTime = Math.max(500, prep.deadline - Date.now());
      let users: HotspotUser[];
      if (prep.isRest) {
        users = await this.restClient.getHotspotUsers(creds, remainingTime, prep.resolvedIp);
      } else {
        users = await this.binaryClient.getHotspotUsers(creds, remainingTime, prep.resolvedIp);
      }
      return { success: true, data: users };
    } catch (rawError: any) {
      const mapped = mapRouterError(rawError);
      return { success: false, errorCode: mapped.errorCode, errorMessage: mapped.errorMessage };
    }
  }

  public async getHotspotActiveSessions(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000
  ): Promise<RouterConnectorResult<HotspotSession[]>> {
    const prep = await this.prepareConnection(creds, timeoutMs);
    if (!prep.success) return prep;

    try {
      const remainingTime = Math.max(500, prep.deadline - Date.now());
      let sessions: HotspotSession[];
      if (prep.isRest) {
        sessions = await this.restClient.getHotspotActiveSessions(creds, remainingTime, prep.resolvedIp);
      } else {
        sessions = await this.binaryClient.getHotspotActiveSessions(creds, remainingTime, prep.resolvedIp);
      }
      return { success: true, data: sessions };
    } catch (rawError: any) {
      const mapped = mapRouterError(rawError);
      return { success: false, errorCode: mapped.errorCode, errorMessage: mapped.errorMessage };
    }
  }

  public async createHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    password: string,
    profile: string,
    options?: CreateHotspotUserOptions,
    timeoutMs: number = 10000
  ): Promise<RouterConnectorResult<void>> {
    if (!this.allowMutations) {
      return {
        success: false,
        errorCode: 'READ_ONLY_PHASE_1',
        errorMessage: 'إنشاء مستخدمي الهوتسبوت داخل الراوتر محظور في المرحلة الأولى (Read-Only Safety Lock).',
      };
    }
    const prep = await this.prepareConnection(creds, timeoutMs);
    if (!prep.success) return prep;

    try {
      const remainingTime = Math.max(500, prep.deadline - Date.now());
      if (prep.isRest) {
        await this.restClient.createHotspotUser(creds, username, password, profile, options, remainingTime, prep.resolvedIp);
      } else {
        await this.binaryClient.createHotspotUser(creds, username, password, profile, options, remainingTime, prep.resolvedIp);
      }
      return { success: true, data: undefined };
    } catch (rawError: any) {
      const mapped = mapRouterError(rawError);
      return { success: false, errorCode: mapped.errorCode, errorMessage: mapped.errorMessage };
    }
  }

  public async enableHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    timeoutMs: number = 10000
  ): Promise<RouterConnectorResult<void>> {
    if (!this.allowMutations) {
      return {
        success: false,
        errorCode: 'READ_ONLY_PHASE_1',
        errorMessage: 'تعديل أو تفعيل مستخدمي الهوتسبوت محظور في المرحلة الأولى (Read-Only Safety Lock).',
      };
    }
    const prep = await this.prepareConnection(creds, timeoutMs);
    if (!prep.success) return prep;

    try {
      const remainingTime = Math.max(500, prep.deadline - Date.now());
      if (prep.isRest) {
        await this.restClient.setUserDisabled(creds, username, false, remainingTime, prep.resolvedIp);
      } else {
        await this.binaryClient.setUserDisabled(creds, username, false, remainingTime, prep.resolvedIp);
      }
      return { success: true, data: undefined };
    } catch (rawError: any) {
      const mapped = mapRouterError(rawError);
      return { success: false, errorCode: mapped.errorCode, errorMessage: mapped.errorMessage };
    }
  }

  public async disableHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    timeoutMs: number = 10000
  ): Promise<RouterConnectorResult<void>> {
    if (!this.allowMutations) {
      return {
        success: false,
        errorCode: 'READ_ONLY_PHASE_1',
        errorMessage: 'تعديل أو تعطيل مستخدمي الهوتسبوت محظور في المرحلة الأولى (Read-Only Safety Lock).',
      };
    }
    const prep = await this.prepareConnection(creds, timeoutMs);
    if (!prep.success) return prep;

    try {
      const remainingTime = Math.max(500, prep.deadline - Date.now());
      if (prep.isRest) {
        await this.restClient.setUserDisabled(creds, username, true, remainingTime, prep.resolvedIp);
      } else {
        await this.binaryClient.setUserDisabled(creds, username, true, remainingTime, prep.resolvedIp);
      }
      return { success: true, data: undefined };
    } catch (rawError: any) {
      const mapped = mapRouterError(rawError);
      return { success: false, errorCode: mapped.errorCode, errorMessage: mapped.errorMessage };
    }
  }

  public async disconnectActiveSession(
    creds: RouterCredentialsInput,
    username: string,
    timeoutMs: number = 10000
  ): Promise<RouterConnectorResult<void>> {
    if (!this.allowMutations) {
      return {
        success: false,
        errorCode: 'READ_ONLY_PHASE_1',
        errorMessage: 'فصل الجلسات النشطة محظور في المرحلة الأولى (Read-Only Safety Lock).',
      };
    }
    const prep = await this.prepareConnection(creds, timeoutMs);
    if (!prep.success) return prep;

    try {
      const remainingTime = Math.max(500, prep.deadline - Date.now());
      if (prep.isRest) {
        await this.restClient.disconnectActiveSession(creds, username, remainingTime, prep.resolvedIp);
      } else {
        await this.binaryClient.disconnectActiveSession(creds, username, remainingTime, prep.resolvedIp);
      }
      return { success: true, data: undefined };
    } catch (rawError: any) {
      const mapped = mapRouterError(rawError);
      return { success: false, errorCode: mapped.errorCode, errorMessage: mapped.errorMessage };
    }
  }
}

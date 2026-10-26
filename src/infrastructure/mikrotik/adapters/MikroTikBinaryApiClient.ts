// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/mikrotik/adapters/MikroTikBinaryApiClient.ts
// Adapter: Real MikroTik RouterOS Binary API & API-SSL Client (Ports 8728 / 8729)
// Master Reference: Rule 5 (Router Connector), Rule 14 (Security), Rule 23 (Errors)
// ============================================================================

import tls from 'node:tls';
import { RouterOSAPI } from 'routeros-api';
import {
  RouterCredentialsInput,
  RouterInfo,
  HotspotUser,
  HotspotSession,
  CreateHotspotUserOptions,
} from '../../../application/interfaces/IRouterConnector.js';
import { parseRouterOsUptime } from './MikroTikErrorMapper.js';

export class MikroTikBinaryApiClient {
  /**
   * Connects to a MikroTik router via RouterOS Binary API (plain 8728 or TLS 8729),
   * retrieves diagnostic specifications, and guarantees immediate connection teardown.
   */
  public async testAndReadInfo(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<RouterInfo> {
    const isPort8728 = creds.port === 8728;
    const isExplicitSsl = creds.connectionMethod === 'ROUTEROS_API_SSL' || creds.port === 8729;

    // Strict security rule: Never use TLS with an unencrypted port (8728)
    if (isPort8728 && creds.connectionMethod === 'ROUTEROS_API_SSL') {
      const err: any = new Error(
        'تعارض أمني: لا يمكن استخدام اتصال مشفر (TLS / API-SSL) عبر منفذ 8728 غير المشفر. استخدم منفذ 8729 المخصص لـ API-SSL.'
      );
      err.code = 'INVALID_PORT_CONFIGURATION';
      throw err;
    }

    const deadline = Date.now() + timeoutMs;
    const checkDeadlineAndAbort = () => {
      if (signal?.aborted) {
        const err: any = new Error('تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Client Aborted)');
        err.code = 'CLIENT_ABORTED';
        throw err;
      }
      if (Date.now() >= deadline) {
        const err: any = new Error(`انتهت المهلة الزمنية الكلية المحددة للاتصال بالراوتر (${timeoutMs}ms).`);
        err.code = 'TIMEOUT';
        throw err;
      }
    };

    checkDeadlineAndAbort();

    const useTls = !isPort8728 && (isExplicitSsl || creds.port === 8729);

    let tlsOptions: tls.ConnectionOptions | undefined = undefined;
    if (useTls) {
      const rawFingerprint = creds.certificateFingerprint?.trim() || '';
      const cleanFingerprint = rawFingerprint.replace(/[:\s]/g, '').toLowerCase();

      // Validate fingerprint format if supplied (SHA-256 requires 64 hex characters)
      if (rawFingerprint.length > 0 && cleanFingerprint.length !== 64) {
        const err: any = new Error(
          'بصمة الشهادة المدخلة غير صالحة. يجب أن تكون بصمة SHA-256 مكونة من 64 رمزاً سداسي عشري (Hex).'
        );
        err.code = 'INVALID_FINGERPRINT_FORMAT';
        throw err;
      }

      // Security enforcement: Blanket rejectUnauthorized=false is strictly prohibited.
      // rejectUnauthorized is ONLY relaxed when an explicit SHA-256 certificate fingerprint is actively pinned.
      const hasPinning = cleanFingerprint.length === 64;
      const rejectUnauthorized = hasPinning
        ? (creds.tlsRejectUnauthorized ?? false)
        : true;

      const baseTls: tls.ConnectionOptions = {
        rejectUnauthorized,
      };

      if (creds.caCertificate && creds.caCertificate.trim().length > 0) {
        baseTls.ca = [creds.caCertificate.trim()];
      }

      if (hasPinning) {
        baseTls.checkServerIdentity = (_host, cert) => {
          const peerPin = (cert.fingerprint256 || '').replace(/[:\s]/g, '').toLowerCase();
          if (!peerPin || peerPin !== cleanFingerprint) {
            const pinErr: any = new Error(
              `TLS Certificate Fingerprint Mismatch (Expected: ${cleanFingerprint}, Actual: ${peerPin || 'NONE'})`
            );
            pinErr.code = 'TLS_FINGERPRINT_MISMATCH';
            return pinErr;
          }
          return undefined; // Fingerprint verified successfully
        };
      }

      tlsOptions = baseTls;
    }

    const remainingMs = Math.max(500, deadline - Date.now());
    const timeoutSec = Math.max(1, Math.ceil(remainingMs / 1000));

    const apiOptions: any = {
      host: resolvedIp || creds.host,
      port: creds.port,
      user: creds.username,
      password: creds.password,
      timeout: timeoutSec,
      keepalive: false,
    };
    if (tlsOptions) {
      if (resolvedIp && resolvedIp !== creds.host) {
        (tlsOptions as any).servername = creds.host;
      }
      apiOptions.tls = tlsOptions;
    }

    const api = new RouterOSAPI(apiOptions);

    let abortListener: (() => void) | undefined;
    if (signal) {
      abortListener = () => {
        try {
          api.close();
        } catch (_) {}
      };
      signal.addEventListener('abort', abortListener, { once: true });
    }

    try {
      checkDeadlineAndAbort();

      // 1. Establish connection & authenticate
      await api.connect();

      checkDeadlineAndAbort();

      // 2. Query Identity (/system/identity/print)
      let identity = 'MikroTik';
      try {
        const identityData = await api.write('/system/identity/print');
        if (Array.isArray(identityData) && identityData.length > 0) {
          identity = identityData[0]?.name || identity;
        }
      } catch (err: any) {
        checkDeadlineAndAbort();
        if (
          err.message?.includes('not enough permissions') ||
          err.message?.includes('action not permitted') ||
          err.code === 'PERMISSION_DENIED'
        ) {
          throw err;
        }
      }

      checkDeadlineAndAbort();

      // 3. Query Resource (/system/resource/print)
      let version = 'RouterOS';
      let boardName = 'RouterBoard';
      let cpuLoad = 0;
      let uptimeSeconds = 0;
      let freeMemoryBytes: number | undefined;
      let totalMemoryBytes: number | undefined;
      let architectureName: string | undefined;

      try {
        const resourceData = await api.write('/system/resource/print');
        if (Array.isArray(resourceData) && resourceData.length > 0) {
          const res = resourceData[0] || {};
          version = res['version'] ? `RouterOS ${res['version']}` : version;
          boardName = res['board-name'] || boardName;
          cpuLoad = res['cpu-load'] !== undefined ? parseInt(String(res['cpu-load']), 10) || 0 : 0;
          uptimeSeconds = parseRouterOsUptime(res['uptime']);
          architectureName = res['architecture-name'] || undefined;

          if (res['free-memory'] !== undefined) {
            freeMemoryBytes = parseInt(String(res['free-memory']), 10) || undefined;
          }
          if (res['total-memory'] !== undefined) {
            totalMemoryBytes = parseInt(String(res['total-memory']), 10) || undefined;
          }
        }
      } catch (err: any) {
        checkDeadlineAndAbort();
        if (
          err.message?.includes('not enough permissions') ||
          err.message?.includes('action not permitted') ||
          err.code === 'PERMISSION_DENIED'
        ) {
          throw err;
        }
      }

      checkDeadlineAndAbort();

      // 4. Query Routerboard (/system/routerboard/print)
      let model: string | undefined;
      try {
        const rbData = await api.write('/system/routerboard/print');
        if (Array.isArray(rbData) && rbData.length > 0) {
          const rb = rbData[0] || {};
          model = rb['model'] || undefined;
          if (model && (!boardName || boardName === 'RouterBoard')) {
            boardName = model;
          }
        }
      } catch (_) {
        checkDeadlineAndAbort();
        // Routerboard query error fallback
      }

      return {
        identity,
        version,
        boardName,
        model: model || boardName,
        cpuLoad,
        uptimeSeconds,
        freeMemoryBytes,
        totalMemoryBytes,
        architectureName,
      };
    } catch (err: any) {
      if (signal?.aborted || err.code === 'CLIENT_ABORTED') {
        const abortErr: any = new Error('تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Client Aborted)');
        abortErr.code = 'CLIENT_ABORTED';
        throw abortErr;
      }
      throw err;
    } finally {
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
      // 5. Guaranteed connection closure immediately after reading
      try {
        await api.close();
      } catch (_) {
        // Ignore close errors
      }
    }
  }

  private createApi(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    resolvedIp?: string
  ): RouterOSAPI {
    const isPort8728 = creds.port === 8728;
    const isExplicitSsl = creds.connectionMethod === 'ROUTEROS_API_SSL' || creds.port === 8729;
    const useTls = !isPort8728 && (isExplicitSsl || creds.port === 8729);

    let tlsOptions: tls.ConnectionOptions | undefined = undefined;
    if (useTls) {
      const rawFingerprint = creds.certificateFingerprint?.trim() || '';
      const cleanFingerprint = rawFingerprint.replace(/[:\s]/g, '').toLowerCase();
      const hasPinning = cleanFingerprint.length === 64;
      const rejectUnauthorized = hasPinning
        ? (creds.tlsRejectUnauthorized ?? false)
        : true;

      const baseTls: tls.ConnectionOptions = {
        rejectUnauthorized,
      };

      if (creds.caCertificate && creds.caCertificate.trim().length > 0) {
        baseTls.ca = [creds.caCertificate.trim()];
      }

      if (hasPinning) {
        baseTls.checkServerIdentity = (_host, cert) => {
          const peerPin = (cert.fingerprint256 || '').replace(/[:\s]/g, '').toLowerCase();
          if (!peerPin || peerPin !== cleanFingerprint) {
            const pinErr: any = new Error(
              `TLS Certificate Fingerprint Mismatch (Expected: ${cleanFingerprint}, Actual: ${peerPin || 'NONE'})`
            );
            pinErr.code = 'TLS_FINGERPRINT_MISMATCH';
            return pinErr;
          }
          return undefined;
        };
      }

      tlsOptions = baseTls;
    }

    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const apiOptions: any = {
      host: resolvedIp || creds.host,
      port: creds.port,
      user: creds.username,
      password: creds.password,
      timeout: timeoutSec,
      keepalive: false,
    };
    if (tlsOptions) {
      if (resolvedIp && resolvedIp !== creds.host) {
        (tlsOptions as any).servername = creds.host;
      }
      apiOptions.tls = tlsOptions;
    }

    return new RouterOSAPI(apiOptions);
  }

  public async createHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    password: string,
    profile: string,
    options?: CreateHotspotUserOptions,
    timeoutMs: number = 10000,
    resolvedIp?: string
  ): Promise<void> {
    const api = this.createApi(creds, timeoutMs, resolvedIp);
    try {
      await api.connect();
      const params: string[] = [
        `=name=${username}`,
        `=password=${password}`,
        `=profile=${profile || 'default'}`,
      ];
      if (options?.limitUptimeSeconds && options.limitUptimeSeconds > 0) {
        params.push(`=limit-uptime=${options.limitUptimeSeconds}s`);
      }
      if (options?.limitBytesTotal && BigInt(options.limitBytesTotal) > BigInt(0)) {
        params.push(`=limit-bytes-total=${options.limitBytesTotal.toString()}`);
      }
      if (options?.rateLimit && options.rateLimit.trim().length > 0) {
        params.push(`=rate-limit=${options.rateLimit.trim()}`);
      }
      if (options?.comment) {
        params.push(`=comment=${options.comment}`);
      }
      await api.write('/ip/hotspot/user/add', params);
    } finally {
      try {
        await api.close();
      } catch (_) {}
    }
  }

  public async getHotspotUsers(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    resolvedIp?: string
  ): Promise<HotspotUser[]> {
    const api = this.createApi(creds, timeoutMs, resolvedIp);
    try {
      await api.connect();
      const users = await api.write('/ip/hotspot/user/print');
      if (!Array.isArray(users)) return [];
      return users.map((u: any) => ({
        username: u.name || '',
        profile: u.profile || 'default',
        isEnabled: u.disabled !== 'true' && u.disabled !== true,
        uptimeSeconds: parseRouterOsUptime(u.uptime),
        bytesIn: u['bytes-in'] !== undefined ? BigInt(u['bytes-in']) : BigInt(0),
        bytesOut: u['bytes-out'] !== undefined ? BigInt(u['bytes-out']) : BigInt(0),
        comment: u.comment || undefined,
      }));
    } finally {
      try {
        await api.close();
      } catch (_) {}
    }
  }

  public async setUserDisabled(
    creds: RouterCredentialsInput,
    username: string,
    disabled: boolean,
    timeoutMs: number = 10000,
    resolvedIp?: string
  ): Promise<void> {
    const api = this.createApi(creds, timeoutMs, resolvedIp);
    try {
      await api.connect();
      const users = await api.write('/ip/hotspot/user/print', [`?name=${username}`]);
      const targetUser = Array.isArray(users) && users.length > 0 ? (users[0] as any) : null;
      if (targetUser && targetUser['.id']) {
        const id = targetUser['.id'];
        await api.write('/ip/hotspot/user/set', [`=.id=${id}`, `=disabled=${disabled ? 'yes' : 'no'}`]);
      } else {
        throw new Error(`HotSpot user '${username}' not found on router`);
      }
    } finally {
      try {
        await api.close();
      } catch (_) {}
    }
  }

  public async getHotspotActiveSessions(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    resolvedIp?: string
  ): Promise<HotspotSession[]> {
    const api = this.createApi(creds, timeoutMs, resolvedIp);
    try {
      await api.connect();
      const active = await api.write('/ip/hotspot/active/print');
      if (!Array.isArray(active)) return [];
      return active.map((s: any) => ({
        id: s['.id'] || undefined,
        username: s.user || s.name || '',
        ipAddress: s.address || undefined,
        macAddress: s['mac-address'] || undefined,
        uptimeSeconds: parseRouterOsUptime(s.uptime),
        bytesIn: s['bytes-in'] !== undefined ? BigInt(s['bytes-in']) : BigInt(0),
        bytesOut: s['bytes-out'] !== undefined ? BigInt(s['bytes-out']) : BigInt(0),
      }));
    } finally {
      try {
        await api.close();
      } catch (_) {}
    }
  }

  public async disconnectActiveSession(
    creds: RouterCredentialsInput,
    username: string,
    timeoutMs: number = 10000,
    resolvedIp?: string
  ): Promise<void> {
    const api = this.createApi(creds, timeoutMs, resolvedIp);
    try {
      await api.connect();
      const active = await api.write('/ip/hotspot/active/print', [`?user=${username}`]);
      if (Array.isArray(active) && active.length > 0) {
        for (const item of active) {
          if (item['.id']) {
            await api.write('/ip/hotspot/active/remove', [`=.id=${item['.id']}`]);
          }
        }
      }
    } finally {
      try {
        await api.close();
      } catch (_) {}
    }
  }
}

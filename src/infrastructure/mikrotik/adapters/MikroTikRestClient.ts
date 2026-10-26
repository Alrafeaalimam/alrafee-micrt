// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/mikrotik/adapters/MikroTikRestClient.ts
// Adapter: Real MikroTik RouterOS v7 REST API Client (HTTPS Port 443 / HTTP Port 80)
// Master Reference: Rule 5 (Router Connector), Rule 14 (Security), Rule 23 (Errors)
// ============================================================================

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import {
  RouterCredentialsInput,
  RouterInfo,
  HotspotUser,
  HotspotSession,
  CreateHotspotUserOptions,
} from '../../../application/interfaces/IRouterConnector.js';
import { parseRouterOsUptime } from './MikroTikErrorMapper.js';

export class MikroTikRestClient {
  /**
   * Connects to a RouterOS v7 router via REST API over HTTPS/HTTP,
   * queries system resources with unified total timeout and cancellation support,
   * and cleanly tears down resources.
   */
  public async testAndReadInfo(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<RouterInfo> {
    const isHttps = creds.port !== 80 && creds.connectionMethod !== 'REST_API_PLAIN';
    const protocol = isHttps ? 'https' : 'http';
    const deadline = Date.now() + timeoutMs;

    const getRemainingTimeout = (): number => {
      if (signal?.aborted) {
        const err: any = new Error('تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Client Aborted)');
        err.code = 'CLIENT_ABORTED';
        throw err;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 200) {
        const err: any = new Error(`انتهت المهلة الزمنية الكلية المحددة للاتصال بالراوتر (${timeoutMs}ms).`);
        err.code = 'TIMEOUT';
        throw err;
      }
      return remaining;
    };

    // 1. Fetch System Identity (/rest/system/identity)
    let identity = 'MikroTik';
    try {
      const stepTimeout = getRemainingTimeout();
      const idJson = await this.executeRestGet(
        protocol,
        creds,
        '/rest/system/identity',
        stepTimeout,
        resolvedIp,
        signal
      );
      if (idJson && typeof idJson === 'object') {
        identity = idJson.name || (Array.isArray(idJson) && idJson[0]?.name) || identity;
      }
    } catch (err: any) {
      if (
        err.code === 'TIMEOUT' ||
        err.code === 'CLIENT_ABORTED' ||
        err.statusCode === 401 ||
        err.statusCode === 403 ||
        err.statusCode === 404 ||
        err.code === 'SSRF_BLOCKED'
      ) {
        throw err;
      }
    }

    // 2. Fetch System Resource (/rest/system/resource)
    const resourceStepTimeout = getRemainingTimeout();
    const resourceJson = await this.executeRestGet(
      protocol,
      creds,
      '/rest/system/resource',
      resourceStepTimeout,
      resolvedIp,
      signal
    );

    const resObj = Array.isArray(resourceJson) ? resourceJson[0] || {} : resourceJson || {};

    const rawVersion = resObj.version || '';
    const version = rawVersion ? (rawVersion.startsWith('RouterOS') ? rawVersion : `RouterOS ${rawVersion}`) : 'RouterOS v7';
    const boardName = resObj['board-name'] || 'RouterBoard';
    const cpuLoad = resObj['cpu-load'] !== undefined ? parseInt(String(resObj['cpu-load']), 10) || 0 : 0;
    const uptimeSeconds = parseRouterOsUptime(resObj.uptime);
    const architectureName = resObj['architecture-name'] || undefined;
    const freeMemoryBytes = resObj['free-memory'] !== undefined ? parseInt(String(resObj['free-memory']), 10) || undefined : undefined;
    const totalMemoryBytes = resObj['total-memory'] !== undefined ? parseInt(String(resObj['total-memory']), 10) || undefined : undefined;

    // 3. Fetch RouterBoard model (/rest/system/routerboard)
    let model: string | undefined;
    try {
      const rbStepTimeout = getRemainingTimeout();
      const rbJson = await this.executeRestGet(
        protocol,
        creds,
        '/rest/system/routerboard',
        rbStepTimeout,
        resolvedIp,
        signal
      );
      const rbObj = Array.isArray(rbJson) ? rbJson[0] || {} : rbJson || {};
      model = rbObj.model || undefined;
    } catch (err: any) {
      if (err.code === 'TIMEOUT' || err.code === 'CLIENT_ABORTED') {
        throw err;
      }
      // Optional query fallback
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
  }

  private executeRestGet(
    protocol: 'http' | 'https',
    creds: RouterCredentialsInput,
    path: string,
    timeoutMs: number,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        const err: any = new Error('تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Client Aborted)');
        err.code = 'CLIENT_ABORTED';
        return reject(err);
      }
      const authHeader = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;
      const isHttps = protocol === 'https';

      const rawFingerprint = creds.certificateFingerprint?.trim() || '';
      const cleanFingerprint = rawFingerprint.replace(/[:\s]/g, '').toLowerCase();

      // Validate fingerprint format if supplied (SHA-256 requires 64 hex characters)
      if (rawFingerprint.length > 0 && cleanFingerprint.length !== 64) {
        const err: any = new Error(
          'بصمة الشهادة المدخلة غير صالحة. يجب أن تكون بصمة SHA-256 مكونة من 64 رمزاً سداسي عشري (Hex).'
        );
        err.code = 'INVALID_FINGERPRINT_FORMAT';
        return reject(err);
      }

      // Security enforcement: Blanket rejectUnauthorized=false is strictly prohibited.
      // rejectUnauthorized is ONLY relaxed when an explicit SHA-256 certificate fingerprint is actively pinned.
      const hasPinning = cleanFingerprint.length === 64;
      const rejectUnauthorized = hasPinning
        ? (creds.tlsRejectUnauthorized ?? false)
        : true;

      let agentOptions: https.AgentOptions = {
        rejectUnauthorized,
      };

      if (creds.caCertificate && creds.caCertificate.trim().length > 0) {
        agentOptions.ca = [creds.caCertificate.trim()];
      }

      if (hasPinning) {
        agentOptions.checkServerIdentity = (_host, cert: tls.PeerCertificate) => {
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

      const requestModule = isHttps ? https : http;
      const requestOptions: https.RequestOptions = {
        hostname: creds.host,
        port: creds.port,
        path,
        method: 'GET',
        headers: {
          Host: `${creds.host}:${creds.port}`,
          Authorization: authHeader,
          Accept: 'application/json',
          'User-Agent': 'Jalsah-MikroTik-Connector/1.0',
        },
        timeout: timeoutMs,
        ...(signal ? { signal } : {}),
        ...(isHttps ? { agent: new https.Agent(agentOptions) } : {}),
      };

      // DNS Rebinding Defense: Direct socket connection to pre-validated IP
      if (resolvedIp) {
        requestOptions.lookup = (_hostname, options, callback) => {
          const family = net.isIPv6(resolvedIp) ? 6 : 4;
          if (options && options.all) {
            callback(null, [{ address: resolvedIp, family }]);
          } else {
            callback(null, resolvedIp, family);
          }
        };
      }

      const req = requestModule.request(requestOptions, (res) => {
        let body = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          // SSRF Redirect Prevention: Block any 3xx redirect status code
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
            const err: any = new Error(
              `إعادة التوجيه (HTTP Redirect ${res.statusCode}) محظورة أمنياً لمنع هجمات SSRF والتوجيه الخبيث.`
            );
            err.code = 'SSRF_BLOCKED';
            err.statusCode = res.statusCode;
            return reject(err);
          }

          if (res.statusCode === 401) {
            const err: any = new Error('Authentication failed (HTTP 401)');
            err.code = '401';
            err.statusCode = 401;
            return reject(err);
          }

          if (res.statusCode === 403) {
            const err: any = new Error('Permission denied (HTTP 403)');
            err.code = '403';
            err.statusCode = 403;
            return reject(err);
          }

          if (res.statusCode === 404) {
            const err: any = new Error('REST API endpoint not found (HTTP 404)');
            err.code = '404';
            err.statusCode = 404;
            return reject(err);
          }

          if (res.statusCode && res.statusCode >= 400) {
            const err: any = new Error(`Router returned HTTP error ${res.statusCode}: ${body.slice(0, 100)}`);
            err.statusCode = res.statusCode;
            return reject(err);
          }

          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (jsonErr: any) {
            const err: any = new Error(`Failed to parse RouterOS REST JSON response: ${jsonErr.message}`);
            err.code = 'INVALID_RESPONSE';
            reject(err);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const err: any = new Error(`REST connection timed out after ${timeoutMs}ms`);
        err.code = 'TIMEOUT';
        reject(err);
      });

      req.on('error', (err: any) => {
        if (signal?.aborted || err.name === 'AbortError' || err.code === 'ABORT_ERR') {
          const abortErr: any = new Error('تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Client Aborted)');
          abortErr.code = 'CLIENT_ABORTED';
          return reject(abortErr);
        }
        reject(err);
      });

      req.end();
    });
  }

  public async executeRestRequest(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    protocol: 'https' | 'http',
    creds: RouterCredentialsInput,
    path: string,
    payload?: any,
    timeoutMs: number = 10000,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const isHttps = protocol === 'https';
      const authHeader = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;

      const rawFingerprint = creds.certificateFingerprint?.trim() || '';
      const cleanFingerprint = rawFingerprint.replace(/[:\s]/g, '').toLowerCase();

      const hasPinning = cleanFingerprint.length === 64;
      const rejectUnauthorized = hasPinning
        ? (creds.tlsRejectUnauthorized ?? false)
        : true;

      const agentOptions: https.AgentOptions = {
        rejectUnauthorized,
      };

      if (creds.caCertificate && creds.caCertificate.trim().length > 0) {
        agentOptions.ca = [creds.caCertificate.trim()];
      }

      if (hasPinning) {
        agentOptions.checkServerIdentity = (_host, cert: tls.PeerCertificate) => {
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

      const postData = payload ? JSON.stringify(payload) : undefined;
      const requestModule = isHttps ? https : http;
      const requestOptions: https.RequestOptions = {
        hostname: creds.host,
        port: creds.port,
        path,
        method,
        headers: {
          Host: `${creds.host}:${creds.port}`,
          Authorization: authHeader,
          Accept: 'application/json',
          'User-Agent': 'Jalsah-MikroTik-Connector/1.0',
          ...(postData ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          } : {}),
        },
        timeout: timeoutMs,
        ...(signal ? { signal } : {}),
        ...(isHttps ? { agent: new https.Agent(agentOptions) } : {}),
      };

      if (resolvedIp) {
        requestOptions.lookup = (_hostname, options, callback) => {
          const family = net.isIPv6(resolvedIp) ? 6 : 4;
          if (options && options.all) {
            callback(null, [{ address: resolvedIp, family }]);
          } else {
            callback(null, resolvedIp, family);
          }
        };
      }

      const req = requestModule.request(requestOptions, (res) => {
        let body = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
            const err: any = new Error(
              `إعادة التوجيه (HTTP Redirect ${res.statusCode}) محظورة أمنياً لمنع هجمات SSRF والتوجيه الخبيث.`
            );
            err.code = 'SSRF_BLOCKED';
            err.statusCode = res.statusCode;
            return reject(err);
          }

          if (res.statusCode === 401) {
            const err: any = new Error('Authentication failed (HTTP 401)');
            err.code = '401';
            err.statusCode = 401;
            return reject(err);
          }

          if (res.statusCode === 403) {
            const err: any = new Error('Permission denied (HTTP 403)');
            err.code = '403';
            err.statusCode = 403;
            return reject(err);
          }

          if (res.statusCode === 404) {
            const err: any = new Error('REST API endpoint not found (HTTP 404)');
            err.code = '404';
            err.statusCode = 404;
            return reject(err);
          }

          if (res.statusCode && res.statusCode >= 400) {
            const err: any = new Error(`Router returned HTTP error ${res.statusCode}: ${body.slice(0, 100)}`);
            err.statusCode = res.statusCode;
            return reject(err);
          }

          if (!body || body.trim().length === 0) {
            return resolve({});
          }

          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch {
            resolve(body);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const err: any = new Error(`REST connection timed out after ${timeoutMs}ms`);
        err.code = 'TIMEOUT';
        reject(err);
      });

      req.on('error', (err: any) => {
        if (signal?.aborted || err.name === 'AbortError' || err.code === 'ABORT_ERR') {
          const abortErr: any = new Error('تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Client Aborted)');
          abortErr.code = 'CLIENT_ABORTED';
          return reject(abortErr);
        }
        reject(err);
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  public async createHotspotUser(
    creds: RouterCredentialsInput,
    username: string,
    password: string,
    profile: string,
    options?: CreateHotspotUserOptions,
    timeoutMs: number = 10000,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<void> {
    const isHttps = creds.port !== 80 && creds.connectionMethod !== 'REST_API_PLAIN';
    const protocol = isHttps ? 'https' : 'http';

    const payload: any = {
      name: username,
      password,
      profile: profile || 'default',
    };
    if (options?.limitUptimeSeconds && options.limitUptimeSeconds > 0) {
      payload['limit-uptime'] = `${options.limitUptimeSeconds}s`;
    }
    if (options?.limitBytesTotal && BigInt(options.limitBytesTotal) > BigInt(0)) {
      payload['limit-bytes-total'] = options.limitBytesTotal.toString();
    }
    if (options?.rateLimit && options.rateLimit.trim().length > 0) {
      payload['rate-limit'] = options.rateLimit.trim();
    }
    if (options?.comment) {
      payload.comment = options.comment;
    }

    await this.executeRestRequest('PUT', protocol, creds, '/rest/ip/hotspot/user', payload, timeoutMs, resolvedIp, signal);
  }

  public async getHotspotUsers(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<HotspotUser[]> {
    const isHttps = creds.port !== 80 && creds.connectionMethod !== 'REST_API_PLAIN';
    const protocol = isHttps ? 'https' : 'http';

    const res = await this.executeRestRequest('GET', protocol, creds, '/rest/ip/hotspot/user', null, timeoutMs, resolvedIp, signal);
    if (!Array.isArray(res)) return [];
    return res.map((u: any) => ({
      username: u.name || '',
      profile: u.profile || 'default',
      isEnabled: u.disabled !== 'true' && u.disabled !== true,
      uptimeSeconds: parseRouterOsUptime(u.uptime),
      bytesIn: u['bytes-in'] !== undefined ? BigInt(u['bytes-in']) : BigInt(0),
      bytesOut: u['bytes-out'] !== undefined ? BigInt(u['bytes-out']) : BigInt(0),
      comment: u.comment || undefined,
    }));
  }

  public async setUserDisabled(
    creds: RouterCredentialsInput,
    username: string,
    disabled: boolean,
    timeoutMs: number = 10000,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<void> {
    const isHttps = creds.port !== 80 && creds.connectionMethod !== 'REST_API_PLAIN';
    const protocol = isHttps ? 'https' : 'http';

    // Query user id first
    const users = await this.executeRestRequest('GET', protocol, creds, `/rest/ip/hotspot/user?name=${encodeURIComponent(username)}`, null, timeoutMs, resolvedIp, signal);
    const userObj = Array.isArray(users) && users.length > 0 ? users[0] : null;
    if (!userObj || !userObj['.id']) {
      throw new Error(`HotSpot user '${username}' not found on router`);
    }

    const id = userObj['.id'];
    await this.executeRestRequest('PATCH', protocol, creds, `/rest/ip/hotspot/user/${encodeURIComponent(id)}`, {
      disabled: disabled ? 'yes' : 'no',
    }, timeoutMs, resolvedIp, signal);
  }

  public async getHotspotActiveSessions(
    creds: RouterCredentialsInput,
    timeoutMs: number = 10000,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<HotspotSession[]> {
    const isHttps = creds.port !== 80 && creds.connectionMethod !== 'REST_API_PLAIN';
    const protocol = isHttps ? 'https' : 'http';

    const res = await this.executeRestRequest('GET', protocol, creds, '/rest/ip/hotspot/active', null, timeoutMs, resolvedIp, signal);
    if (!Array.isArray(res)) return [];
    return res.map((s: any) => ({
      id: s['.id'] || undefined,
      username: s.user || s.name || '',
      ipAddress: s.address || undefined,
      macAddress: s['mac-address'] || undefined,
      uptimeSeconds: parseRouterOsUptime(s.uptime),
      bytesIn: s['bytes-in'] !== undefined ? BigInt(s['bytes-in']) : BigInt(0),
      bytesOut: s['bytes-out'] !== undefined ? BigInt(s['bytes-out']) : BigInt(0),
    }));
  }

  public async disconnectActiveSession(
    creds: RouterCredentialsInput,
    username: string,
    timeoutMs: number = 10000,
    resolvedIp?: string,
    signal?: AbortSignal
  ): Promise<void> {
    const isHttps = creds.port !== 80 && creds.connectionMethod !== 'REST_API_PLAIN';
    const protocol = isHttps ? 'https' : 'http';

    const sessions = await this.executeRestRequest('GET', protocol, creds, `/rest/ip/hotspot/active?user=${encodeURIComponent(username)}`, null, timeoutMs, resolvedIp, signal);
    if (Array.isArray(sessions)) {
      for (const s of sessions) {
        if (s['.id']) {
          await this.executeRestRequest('DELETE', protocol, creds, `/rest/ip/hotspot/active/${encodeURIComponent(s['.id'])}`, null, timeoutMs, resolvedIp, signal);
        }
      }
    }
  }
}

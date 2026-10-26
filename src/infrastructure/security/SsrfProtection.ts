// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/security/SsrfProtection.ts
// Security: Server-Side Request Forgery (SSRF) Prevention for Outbound Connections
// Master Reference: Rule 14 (Security), Rule 19 (Validation)
// ============================================================================

import dns from 'node:dns/promises';
import net from 'node:net';

export interface SsrfValidationResult {
  readonly isAllowed: boolean;
  readonly isPrivate?: boolean | undefined;
  readonly reason?: string | undefined;
  readonly resolvedIp?: string | undefined;
}

/**
 * Checks whether an IPv4 address belongs to a reserved or private CIDR range.
 */
function isPrivateOrReservedIpv4(ip: string): { isPrivate: boolean; isDangerous: boolean; category: string } {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return { isPrivate: true, isDangerous: true, category: 'INVALID_IP' };
  }

  const [b0, b1] = parts;

  // 1. Loopback (127.0.0.0/8) -> HIGH DANGER
  if (b0 === 127) {
    return { isPrivate: true, isDangerous: true, category: 'LOOPBACK' };
  }

  // 2. Unspecified / Current Network (0.0.0.0/8) -> HIGH DANGER
  if (b0 === 0) {
    return { isPrivate: true, isDangerous: true, category: 'UNSPECIFIED' };
  }

  // 3. Link-Local & Cloud Metadata (169.254.0.0/16 - includes 169.254.169.254) -> CRITICAL
  if (b0 === 169 && b1 === 254) {
    return { isPrivate: true, isDangerous: true, category: 'CLOUD_METADATA_LINK_LOCAL' };
  }

  // 4. Broadcast (255.255.255.255)
  if (parts.every((p) => p === 255)) {
    return { isPrivate: true, isDangerous: true, category: 'BROADCAST' };
  }

  // 5. RFC 1918 Private Ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (b0 === 10) {
    return { isPrivate: true, isDangerous: false, category: 'RFC1918_10' };
  }
  if (b0 === 172 && b1 !== undefined && b1 >= 16 && b1 <= 31) {
    return { isPrivate: true, isDangerous: false, category: 'RFC1918_172' };
  }
  if (b0 === 192 && b1 === 168) {
    return { isPrivate: true, isDangerous: false, category: 'RFC1918_192' };
  }

  // 6. Carrier-Grade NAT (100.64.0.0/10)
  if (b0 === 100 && b1 !== undefined && b1 >= 64 && b1 <= 127) {
    return { isPrivate: true, isDangerous: false, category: 'CGNAT' };
  }

  // 7. Multicast (224.0.0.0/4)
  if (b0 !== undefined && b0 >= 224 && b0 <= 239) {
    return { isPrivate: true, isDangerous: true, category: 'MULTICAST' };
  }

  return { isPrivate: false, isDangerous: false, category: 'PUBLIC' };
}

/**
 * Expands any valid IPv6 address into its 8 16-bit integer words (0x0000 - 0xffff).
 * Handles bracketed notation, :: zero compaction, and embedded dotted-quad IPv4.
 */
function expandIpv6ToHexWords(ip: string): number[] | null {
  let cleanIp = ip.toLowerCase().trim();
  if (cleanIp.startsWith('[') && cleanIp.endsWith(']')) {
    cleanIp = cleanIp.slice(1, -1);
  }

  // Handle embedded dotted-quad IPv4, e.g. ::ffff:192.168.1.1
  if (cleanIp.includes('.')) {
    const lastColon = cleanIp.lastIndexOf(':');
    if (lastColon === -1) return null;
    const v4Str = cleanIp.substring(lastColon + 1);
    if (!net.isIPv4(v4Str)) return null;
    const [o0, o1, o2, o3] = v4Str.split('.').map((p) => parseInt(p, 10));
    if (o0 === undefined || o1 === undefined || o2 === undefined || o3 === undefined) return null;
    const h1 = ((o0 << 8) | o1).toString(16);
    const h2 = ((o2 << 8) | o3).toString(16);
    cleanIp = cleanIp.substring(0, lastColon + 1) + h1 + ':' + h2;
  }

  // Expand :: compaction
  let parts = cleanIp.split(':');
  if (cleanIp.includes('::')) {
    const [leftStr, rightStr] = cleanIp.split('::');
    const leftParts = leftStr ? leftStr.split(':') : [];
    const rightParts = rightStr ? rightStr.split(':') : [];
    const missing = 8 - (leftParts.length + rightParts.length);
    if (missing < 0) return null;
    parts = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
  }

  if (parts.length !== 8) return null;
  const words = parts.map((p) => parseInt(p || '0', 16));
  if (words.some((w) => isNaN(w) || w < 0 || w > 0xffff)) return null;
  return words;
}

/**
 * Checks whether an IPv6 address is dangerous or private.
 * Handles native IPv6, bracketed IPv6, and all representations of IPv4-mapped/compatible IPv6.
 */
function isDangerousOrPrivateIpv6(ip: string): { isDangerous: boolean; isPrivate: boolean; category: string } {
  let normalized = ip.toLowerCase().trim();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }

  // 1. Literal shorthand checks
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    return { isDangerous: true, isPrivate: true, category: 'IPV6_LOOPBACK' };
  }

  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') {
    return { isDangerous: true, isPrivate: true, category: 'IPV6_UNSPECIFIED' };
  }

  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return { isDangerous: true, isPrivate: true, category: 'IPV6_LINK_LOCAL' };
  }

  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return { isDangerous: false, isPrivate: true, category: 'IPV6_ULA' };
  }

  // 2. Full 128-bit word expansion for alternative representations (e.g. ::ffff:7f00:1, ::ffff:a9fe:a9fe)
  const words = expandIpv6ToHexWords(normalized);
  if (words) {
    // Loopback: 0:0:0:0:0:0:0:1
    if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) {
      return { isDangerous: true, isPrivate: true, category: 'IPV6_LOOPBACK' };
    }
    // Unspecified: 0:0:0:0:0:0:0:0
    if (words.every((w) => w === 0)) {
      return { isDangerous: true, isPrivate: true, category: 'IPV6_UNSPECIFIED' };
    }
    // Link-Local: fe80::/10 (top 10 bits = 0xfe80)
    if ((words[0]! & 0xffc0) === 0xfe80) {
      return { isDangerous: true, isPrivate: true, category: 'IPV6_LINK_LOCAL' };
    }
    // Unique Local: fc00::/7 (top 7 bits = 0xfc00)
    if ((words[0]! & 0xfe00) === 0xfc00) {
      return { isDangerous: false, isPrivate: true, category: 'IPV6_ULA' };
    }

    // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::0:0/96)
    const isMappedOrCompat =
      words[0] === 0 &&
      words[1] === 0 &&
      words[2] === 0 &&
      words[3] === 0 &&
      words[4] === 0 &&
      (words[5] === 0xffff || words[5] === 0);

    if (isMappedOrCompat) {
      const w6 = words[6]!;
      const w7 = words[7]!;
      const v4Part = `${w6 >> 8}.${w6 & 0xff}.${w7 >> 8}.${w7 & 0xff}`;
      const v4Check = isPrivateOrReservedIpv4(v4Part);
      return {
        isDangerous: v4Check.isDangerous,
        isPrivate: v4Check.isPrivate,
        category: `IPV6_MAPPED_${v4Check.category}`,
      };
    }
  }

  return { isDangerous: false, isPrivate: false, category: 'IPV6_PUBLIC' };
}

/**
 * Checks whether an IPv4 address belongs to a specified CIDR subnet (e.g., 10.200.0.0/24).
 */
function isIpInSubnet(ip: string, cidr: string): boolean {
  try {
    const [range, prefixStr] = cidr.trim().split('/');
    if (!range || !net.isIPv4(range) || !net.isIPv4(ip)) return false;
    const prefix = prefixStr !== undefined ? parseInt(prefixStr, 10) : 32;
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    const ipNum = ip.split('.').reduce((acc, oct) => ((acc << 8) + parseInt(oct, 10)) >>> 0, 0);
    const rangeNum = range.split('.').reduce((acc, oct) => ((acc << 8) + parseInt(oct, 10)) >>> 0, 0);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

export class SsrfProtection {
  /**
   * Verifies if a private IP is part of an explicitly authorized VPN subnet
   * configured via AUTHORIZED_VPN_SUBNETS environment variable.
   */
  public static isAuthorizedVpnIp(ip: string): boolean {
    const raw = process.env['AUTHORIZED_VPN_SUBNETS'] || '';
    if (!raw.trim()) return false;
    const subnets = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return subnets.some((subnet) => isIpInSubnet(ip, subnet));
  }
  /**
   * Resolves hostname with an explicit timeout and cancellation support.
   */
  private static async resolveDnsWithTimeout(
    hostname: string,
    timeoutMs: number = 3000,
    signal?: AbortSignal
  ): Promise<Array<{ address: string; family: number }>> {
    if (signal?.aborted) {
      const err: any = new Error('تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Client Aborted)');
      err.code = 'CLIENT_ABORTED';
      throw err;
    }

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err: any = new Error(
          `انتهت المهلة الزمنية (${timeoutMs}ms) أثناء محاولة التحقق من اسم المضيف '${hostname}' عبر DNS (DNS Resolution Timeout).`
        );
        err.code = 'DNS_TIMEOUT';
        reject(err);
      }, timeoutMs);
    });

    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              const err: any = new Error('تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Client Aborted)');
              err.code = 'CLIENT_ABORTED';
              reject(err);
            },
            { once: true }
          );
        })
      : null;

    try {
      const dnsPromise = dns.lookup(hostname, { all: true });
      const raceList: Promise<any>[] = [dnsPromise, timeoutPromise];
      if (abortPromise) raceList.push(abortPromise);

      const records = (await Promise.race(raceList)) as Array<{ address: string; family: number }>;
      return records;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Validates target host before any outbound socket or HTTP connection is initiated.
   *
   * @param host Target IP address or hostname
   * @param allowPrivateIps Explicit override to permit RFC 1918 private IPs (e.g. for on-premise or VPN)
   * @param timeoutMs Optional maximum timeout allowed for DNS resolution (defaults to 3000ms)
   * @param signal Optional AbortSignal to immediately abort DNS lookup on client disconnect
   */
  public static async validateTarget(
    host: string,
    allowPrivateIps?: boolean,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<SsrfValidationResult> {
    if (signal?.aborted) {
      return { isAllowed: false, reason: 'تم إلغاء العملية بناءً على انقطاع طلب العميل (Client Aborted)' };
    }

    if (!host || typeof host !== 'string' || host.trim().length === 0) {
      return { isAllowed: false, reason: 'عنوان المضيف لا يمكن أن يكون فارغاً' };
    }

    const rawHost = host.trim().toLowerCase();
    // Normalize bracketed IPv6/IPv4 notation (e.g. [::1], [::ffff:127.0.0.1])
    const trimmed = rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;

    // 1. Block literal localhost and dangerous domain patterns
    if (
      trimmed === 'localhost' ||
      trimmed.endsWith('.localhost') ||
      trimmed.endsWith('.local') ||
      trimmed.endsWith('.internal')
    ) {
      return {
        isAllowed: false,
        reason: 'محاولة اتصال محظورة أمنياً: لا يمكن توجيه الاتصال إلى نطاقات localhost أو النطاقات الداخلية المحلية (SSRF Protection).',
      };
    }

    // Determine whether private RFC 1918 IPs are allowed via env or explicit argument
    const permitPrivate =
      allowPrivateIps === true ||
      process.env['ALLOW_PRIVATE_ROUTER_IPS'] === 'true' ||
      process.env['NODE_ENV'] === 'test';

    // 2. Direct IP evaluation
    if (net.isIPv4(trimmed)) {
      return this.evaluateIpv4(trimmed, permitPrivate);
    }

    if (net.isIPv6(trimmed)) {
      return this.evaluateIpv6(trimmed, permitPrivate);
    }

    // 3. Hostname DNS Resolution (prevents DNS rebinding and internal IP resolution)
    try {
      const dnsTimeout = timeoutMs !== undefined ? Math.max(500, timeoutMs) : 3000;
      const records = await this.resolveDnsWithTimeout(trimmed, dnsTimeout, signal);
      if (!records || records.length === 0) {
        return { isAllowed: false, reason: `تعذر إيجاد العنوان الشبكي لاسم المضيف '${host}'` };
      }

      for (const record of records) {
        if (record.family === 4) {
          const evalResult = this.evaluateIpv4(record.address, permitPrivate);
          if (!evalResult.isAllowed) {
            return {
              isAllowed: false,
              reason: `اسم المضيف '${host}' يشير إلى عنوان محظور أمنياً (${record.address}): ${evalResult.reason}`,
              resolvedIp: record.address,
            };
          }
        } else if (record.family === 6) {
          const evalResult = this.evaluateIpv6(record.address, permitPrivate);
          if (!evalResult.isAllowed) {
            return {
              isAllowed: false,
              reason: `اسم المضيف '${host}' يشير إلى عنوان محظور أمنياً (${record.address}): ${evalResult.reason}`,
              resolvedIp: record.address,
            };
          }
        }
      }

      const firstCheck = records[0]?.family === 4
        ? isPrivateOrReservedIpv4(records[0].address)
        : isDangerousOrPrivateIpv6(records[0]?.address || '');

      return {
        isAllowed: true,
        isPrivate: firstCheck.isPrivate,
        resolvedIp: records[0]?.address,
      };
    } catch (err: any) {
      if (err.code === 'DNS_TIMEOUT' || err.code === 'CLIENT_ABORTED') {
        return {
          isAllowed: false,
          reason: err.message,
        };
      }
      return {
        isAllowed: false,
        reason: `فشل التحقق من اسم المضيف '${host}' عبر DNS: ${err.message || 'خطأ في الاستعلام'}`,
      };
    }
  }

  private static evaluateIpv4(ip: string, permitPrivate: boolean): SsrfValidationResult {
    const check = isPrivateOrReservedIpv4(ip);

    // Always block loopback, cloud metadata, broadcast, and invalid
    if (check.isDangerous) {
      return {
        isAllowed: false,
        isPrivate: check.isPrivate,
        reason: `محاولة اتصال محظورة أمنياً: العنوان (${ip}) يقع ضمن النطاقات الخطرة أو خدمات السيرفر السحابي الداخلية (${check.category}).`,
        resolvedIp: ip,
      };
    }

    // Check private RFC 1918 / CGNAT
    if (check.isPrivate) {
      const isAuthorizedVpn = this.isAuthorizedVpnIp(ip);
      if (!permitPrivate && !isAuthorizedVpn) {
        return {
          isAllowed: false,
          isPrivate: true,
          reason: `العنوان (${ip}) هو عنوان شبكة محلية خاصة (LAN / ${check.category}) غير مسجل ضمن نطاقات VPN المصرح بها. لا يمكن للسيرفر السحابي الوصول إليه مباشرة عبر الإنترنت العام بدون نفق VPN معتمد.`,
          resolvedIp: ip,
        };
      }
    }

    return { isAllowed: true, isPrivate: check.isPrivate, resolvedIp: ip };
  }

  private static evaluateIpv6(ip: string, permitPrivate: boolean): SsrfValidationResult {
    const check = isDangerousOrPrivateIpv6(ip);

    if (check.isDangerous) {
      return {
        isAllowed: false,
        isPrivate: check.isPrivate,
        reason: `محاولة اتصال محظورة أمنياً: العنوان (${ip}) يقع ضمن نطاقات IPv6 الخطرة (${check.category}).`,
        resolvedIp: ip,
      };
    }

    if (check.isPrivate && !permitPrivate) {
      return {
        isAllowed: false,
        isPrivate: true,
        reason: `العنوان (${ip}) هو عنوان شبكة محلية خاصة (${check.category}). لا يمكن الوصول إليه مباشرة من السيرفر السحابي بدون نفق VPN.`,
        resolvedIp: ip,
      };
    }

    return { isAllowed: true, isPrivate: check.isPrivate, resolvedIp: ip };
  }
}

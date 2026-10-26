// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/security/RouterRateLimiter.ts
// Security: Process-Level Sliding Window & Concurrency Limiter for Diagnostic Probes
// Master Reference: Rule 14 (Security), Rule 19 (Validation & Rate Limiting)
// ============================================================================

export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number | undefined;
  readonly reason?: string | undefined;
}

interface TenantProbeState {
  timestamps: number[];
  concurrentCount: number;
}

export class RouterRateLimiter {
  private readonly states = new Map<string, TenantProbeState>();
  private readonly maxRequestsPerWindow: number;
  private readonly windowMs: number;
  private readonly maxConcurrentPerTenant: number;

  constructor(
    maxRequestsPerWindow: number = 10,
    windowMs: number = 60000,
    maxConcurrentPerTenant: number = 2
  ) {
    this.maxRequestsPerWindow = parseInt(
      process.env['ROUTER_PROBE_RATE_LIMIT_MAX'] || String(maxRequestsPerWindow),
      10
    );
    this.windowMs = parseInt(
      process.env['ROUTER_PROBE_RATE_LIMIT_WINDOW_MS'] || String(windowMs),
      10
    );
    this.maxConcurrentPerTenant = parseInt(
      process.env['ROUTER_PROBE_MAX_CONCURRENT'] || String(maxConcurrentPerTenant),
      10
    );
  }

  /**
   * Attempts to acquire an execution slot for a tenant diagnostic probe.
   * Enforces both concurrent in-flight limits and window-based rate limits.
   *
   * @param tenantId The authenticated tenant ID (guaranteed by JWT)
   */
  public acquire(tenantId: string): RateLimitCheckResult {
    const now = Date.now();
    let state = this.states.get(tenantId);

    if (!state) {
      state = { timestamps: [], concurrentCount: 0 };
      this.states.set(tenantId, state);
    }

    // 1. Enforce concurrency limits
    const maxConcurrent = parseInt(
      process.env['ROUTER_PROBE_MAX_CONCURRENT'] || String(this.maxConcurrentPerTenant),
      10
    );
    if (state.concurrentCount >= maxConcurrent) {
      return {
        allowed: false,
        retryAfterSeconds: 5,
        reason: `يوجد فحص اتصال قيد التشغيل بالفعل لهذا الحساب (${state.concurrentCount} متزامن). يرجى الانتظار حتى اكتماله.`,
      };
    }

    // 2. Clean up timestamps outside current sliding window
    const windowMs = parseInt(
      process.env['ROUTER_PROBE_RATE_LIMIT_WINDOW_MS'] || String(this.windowMs),
      10
    );
    const windowStart = now - windowMs;
    state.timestamps = state.timestamps.filter((ts) => ts > windowStart);

    // 3. Enforce window-based request rate limit
    const maxRequests = parseInt(
      process.env['ROUTER_PROBE_RATE_LIMIT_MAX'] || String(this.maxRequestsPerWindow),
      10
    );
    if (state.timestamps.length >= maxRequests) {
      const oldest = state.timestamps[0] || now;
      const retryAfterMs = Math.max(1000, oldest + windowMs - now);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      return {
        allowed: false,
        retryAfterSeconds,
        reason: `تم تجاوز الحد الأقصى المسموح به لطلبات فحص الاتصال (${maxRequests} طلبات في الدقيقة). يرجى الانتظار ${retryAfterSeconds} ثانية قبل إعادة المحاولة.`,
      };
    }

    // 4. Grant slot
    state.timestamps.push(now);
    state.concurrentCount += 1;

    return { allowed: true };
  }

  /**
   * Releases a concurrent in-flight slot when the probe finishes or fails.
   */
  public release(tenantId: string): void {
    const state = this.states.get(tenantId);
    if (state) {
      state.concurrentCount = Math.max(0, state.concurrentCount - 1);
    }
  }

  /**
   * Clears state for testing purposes.
   */
  public reset(tenantId?: string): void {
    if (tenantId) {
      this.states.delete(tenantId);
    } else {
      this.states.clear();
    }
  }
}

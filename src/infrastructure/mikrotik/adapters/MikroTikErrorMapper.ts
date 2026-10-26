// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/mikrotik/adapters/MikroTikErrorMapper.ts
// Adapter: RouterOS Error Discrimination & Sanitization (Zero Secret Leakage)
// Master Reference: Rule 23 (Error Handling), Rule 14 (Security)
// ============================================================================

export interface MappedRouterError {
  readonly errorCode: string;
  readonly errorMessage: string;
}

export function parseRouterOsUptime(str: any): number {
  if (typeof str === 'number') return Math.max(0, Math.floor(str));
  if (!str || typeof str !== 'string') return 0;

  let total = 0;
  const weeks = str.match(/(\d+)w/);
  const days = str.match(/(\d+)d/);
  const hours = str.match(/(\d+)h/);
  const minutes = str.match(/(\d+)m(?!s)/);
  const seconds = str.match(/(\d+)s/);

  if (weeks && weeks[1]) total += parseInt(weeks[1], 10) * 7 * 86400;
  if (days && days[1]) total += parseInt(days[1], 10) * 86400;
  if (hours && hours[1]) total += parseInt(hours[1], 10) * 3600;
  if (minutes && minutes[1]) total += parseInt(minutes[1], 10) * 60;
  if (seconds && seconds[1]) total += parseInt(seconds[1], 10);

  // Fallback for standard hh:mm:ss in compound formats like 1w2d03:04:05 or standalone 04:12:30
  const timePart = str.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (timePart && !hours && !minutes && !seconds) {
    if (timePart[1] && timePart[2] && timePart[3]) {
      total +=
        parseInt(timePart[1], 10) * 3600 +
        parseInt(timePart[2], 10) * 60 +
        parseInt(timePart[3], 10);
    }
  }

  return total;
}

/**
 * Sanitizes and maps raw network / RouterOS errors into user-friendly domain errors
 * without leaking sensitive credentials, internal IPs, or cryptographic keys.
 */
export function mapRouterError(err: any): MappedRouterError {
  if (!err) {
    return {
      errorCode: 'UNKNOWN_ERROR',
      errorMessage: 'حدث خطأ غير معروف أثناء محاولة الاتصال بجهاز MikroTik',
    };
  }

  const message = String(err.message || err.errno || err).toLowerCase();
  const code = String(err.code || err.errno || '').toUpperCase();

  // 0. Client Request Cancellation
  if (code === 'CLIENT_ABORTED' || message.includes('client aborted') || message.includes('client_closed_request')) {
    return {
      errorCode: 'CLIENT_ABORTED',
      errorMessage: 'تم إلغاء عملية الفحص بناءً على انقطاع طلب العميل (Request Cancelled).',
    };
  }

  // 0b. DNS Resolution Timeout
  if (code === 'DNS_TIMEOUT' || message.includes('dns resolution timeout')) {
    return {
      errorCode: 'DNS_TIMEOUT',
      errorMessage: 'انتهت المهلة الزمنية أثناء محاولة التحقق من اسم المضيف عبر DNS (DNS Resolution Timeout).',
    };
  }

  // 1. SSRF Blocked
  if (err.isSsrf || code === 'SSRF_BLOCKED' || message.includes('ssrf')) {
    return {
      errorCode: 'SSRF_BLOCKED',
      errorMessage: err.message || 'العنوان الشبكي للراوتر محظور أمنياً لحماية بيئة السيرفر السحابي (SSRF Prevention).',
    };
  }

  // 1b. Port Configuration Conflict
  if (code === 'INVALID_PORT_CONFIGURATION') {
    return {
      errorCode: 'INVALID_PORT_CONFIGURATION',
      errorMessage: err.message || 'تعارض في إعدادات المنفذ ونوع التشفير.',
    };
  }

  // 1c. Unencrypted Internet Connection Blocked
  if (code === 'UNENCRYPTED_CONNECTION_BLOCKED') {
    return {
      errorCode: 'UNENCRYPTED_CONNECTION_BLOCKED',
      errorMessage:
        err.message ||
        'محظور أمنياً: لا يُسمح بإجراء اتصالات غير مشفرة (HTTP أو API غير المشفر 8728) عبر شبكة الإنترنت العامة. يجب استخدام بروتوكول مشفر (API-SSL المنفذ 8729 أو REST HTTPS المنفذ 443) لحماية بيانات الاعتماد من التنصت.',
    };
  }

  // 1d. Invalid Fingerprint Format
  if (code === 'INVALID_FINGERPRINT_FORMAT') {
    return {
      errorCode: 'INVALID_FINGERPRINT_FORMAT',
      errorMessage: err.message || 'بصمة شهادة SSL المدخلة غير صالحة. يجب أن تكون بصمة SHA-256 صحيحة (64 رمزاً سداسي عشري).',
    };
  }

  // 2. Authentication Failure
  if (
    code === 'CANTLOGIN' ||
    message.includes('cantlogin') ||
    message.includes('cannot log in') ||
    message.includes('invalid user name or password') ||
    message.includes('bad login') ||
    message.includes('status 401') ||
    code === '401'
  ) {
    return {
      errorCode: 'AUTHENTICATION_FAILED',
      errorMessage: 'فشلت المصادقة: اسم المستخدم أو كلمة المرور غير صحيحة على جهاز MikroTik.',
    };
  }

  // 3. Permission / Policy Denied
  if (
    message.includes('not enough permissions') ||
    message.includes('action not permitted') ||
    message.includes('status 403') ||
    code === '403'
  ) {
    return {
      errorCode: 'PERMISSION_DENIED',
      errorMessage: 'صلاحيات غير كافية: حساب المستخدم على MikroTik لا يملك صلاحيات (api/read/test) اللازمة.',
    };
  }

  // 4. TLS & Certificate Failures
  if (
    code === 'TLS_FINGERPRINT_MISMATCH' ||
    message.includes('fingerprint mismatch')
  ) {
    return {
      errorCode: 'TLS_FINGERPRINT_MISMATCH',
      errorMessage: 'فشل التحقق من شهادة الأمان: بصمة شهادة SSL للجهاز لا تطابق البصمة المعتمدة (Certificate Fingerprint Mismatch).',
    };
  }

  if (
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    message.includes('self-signed') ||
    message.includes('unable to verify')
  ) {
    return {
      errorCode: 'TLS_SELF_SIGNED_CERTIFICATE',
      errorMessage:
        'شهادة الأمان على الراوتر ذاتية التوقيع (Self-Signed). يجب توفير بصمة الشهادة SHA-256 أو شهادة CA المعتمدة لضمان أمان الاتصال.',
    };
  }

  if (code === 'CERT_HAS_EXPIRED' || message.includes('certificate has expired')) {
    return {
      errorCode: 'TLS_CERT_EXPIRED',
      errorMessage: 'شهادة أمان TLS المثبتة على راوتر MikroTik منتهية الصلاحية.',
    };
  }

  if (
    code.includes('TLS') ||
    code.includes('SSL') ||
    message.includes('tls') ||
    message.includes('ssl routines')
  ) {
    return {
      errorCode: 'TLS_HANDSHAKE_ERROR',
      errorMessage: 'فشل تأسيس الاتصال المشفر (TLS Handshake Error). يرجى التأكد من تفعيل خدمة api-ssl والشهادة الرقمية بالراوتر.',
    };
  }

  // 5. Connection Refused / Closed / Reset
  if (
    code === 'ECONNREFUSED' ||
    message.includes('connection refused')
  ) {
    return {
      errorCode: 'CONNECTION_REFUSED',
      errorMessage: 'تم رفض الاتصال: الراوتر غير متاح أو أن منفذ الخدمة (8729/8728) مغلق في جدار الحماية (Firewall).',
    };
  }

  if (code === 'ECONNRESET' || message.includes('connection reset') || message.includes('econnreset')) {
    return {
      errorCode: 'CONNECTION_RESET',
      errorMessage: 'أغلق الراوتر الاتصال بشكل مفاجئ (Connection Reset). قد يكون السبب تشفير غير متوافق أو حظر من جدار الحماية.',
    };
  }

  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || message.includes('unreachable')) {
    return {
      errorCode: 'HOST_UNREACHABLE',
      errorMessage: 'تعذر الوصول إلى الجهاز: المسار الشبكي غير متاح (Host Unreachable).',
    };
  }

  // 6. Timeout
  if (
    code === 'SOCKTMOUT' ||
    code === 'ETIMEDOUT' ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return {
      errorCode: 'TIMEOUT',
      errorMessage: 'انتهت المهلة الزمنية أثناء محاولة الاتصال بالراوتر دون استجابة.',
    };
  }

  // 7. Unsupported RouterOS Version or Missing REST Endpoint
  if (message.includes('status 404') || code === '404') {
    return {
      errorCode: 'UNSUPPORTED_VERSION',
      errorMessage: 'خدمة REST API غير متاحة على هذا الجهاز. تتطلب خدمة REST إصدار RouterOS v7.1 أو أحدث مع تفعيل www-ssl.',
    };
  }

  // 8. Port Configuration Conflict
  if (code === 'INVALID_PORT_CONFIGURATION') {
    return {
      errorCode: 'INVALID_PORT_CONFIGURATION',
      errorMessage: err.message || 'تعارض في إعدادات المنفذ ونوع التشفير.',
    };
  }

  // Default Fallback with Strict Secret Sanitization
  const rawMsg = String(err.message || 'خطأ غير محدد');
  const sanitizedMsg = rawMsg
    .replace(/:[^@\s]+@/g, ':***@')
    .replace(/(password|pass|secret|token)[=:]\s*[^\s,&]+/gi, '$1=***');

  return {
    errorCode: 'ROUTER_COMMUNICATION_ERROR',
    errorMessage: `فشل الاتصال بجهاز MikroTik: ${sanitizedMsg}`,
  };
}

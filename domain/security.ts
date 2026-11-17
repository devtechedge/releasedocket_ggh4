import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function hashPassword(password: string): string {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

const PRIVATE_IPV4_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

/**
 * Prevents SSRF / unsafe scheme injection on user-supplied evidence URLs.
 */
export function validateSafeExternalUrl(rawUrl: string): {
  valid: boolean;
  normalized?: string;
  error?: string;
} {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: 'Only HTTPS URLs are permitted for external evidence links.',
      };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      PRIVATE_IPV4_PATTERNS.some((re) => re.test(host))
    ) {
      return {
        valid: false,
        error: 'Private, loopback, and link-local hosts are not permitted.',
      };
    }
    return { valid: true, normalized: parsed.toString() };
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }
}

const SENSITIVE_KEY_RE =
  /(secret|token|password|api[-_]?key|private[-_]?key|authorization|cookie|signature)/i;

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactForLog);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactForLog(v);
      }
    }
    return out;
  }
  return value;
}

export function generateOtpCode(): string {
  const num = randomBytes(4).readUInt32BE(0) % 1000000;
  return String(num).padStart(6, '0');
}

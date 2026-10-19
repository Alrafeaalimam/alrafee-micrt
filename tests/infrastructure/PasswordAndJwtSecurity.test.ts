// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/infrastructure/PasswordAndJwtSecurity.test.ts
// Unit Tests: Password Hashing (bcrypt) & JWT Signing/Verification (Rule 14)
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../src/infrastructure/security/password.js';
import { signToken, verifyToken } from '../../src/infrastructure/security/jwt.js';

describe('Password and JWT Security Utilities', () => {
  describe('Password Hashing (bcrypt)', () => {
    it('should hash a password and verify successfully', async () => {
      const password = 'SuperSecretPassword@2026';
      const hash = await hashPassword(password);

      assert.notStrictEqual(hash, password);
      assert.ok(hash.startsWith('$2'));

      const isMatch = await verifyPassword(password, hash);
      assert.strictEqual(isMatch, true);
    });

    it('should reject an incorrect password against the hash', async () => {
      const password = 'CorrectPassword123';
      const wrongPassword = 'WrongPassword123';
      const hash = await hashPassword(password);

      const isMatch = await verifyPassword(wrongPassword, hash);
      assert.strictEqual(isMatch, false);
    });
  });

  describe('JWT Operations', () => {
    const payload = {
      userId: 'user-uuid-1',
      tenantId: 'tenant-uuid-1',
      role: 'TENANT_ADMIN',
    };

    it('should sign and successfully verify a JWT token with 24h payload', () => {
      const token = signToken(payload);
      assert.ok(typeof token === 'string' && token.length > 20);

      const decoded = verifyToken(token);
      assert.strictEqual(decoded.userId, payload.userId);
      assert.strictEqual(decoded.tenantId, payload.tenantId);
      assert.strictEqual(decoded.role, payload.role);
    });

    it('should throw an error when verifying an invalid or tampered token', () => {
      assert.throws(() => {
        verifyToken('invalid.token.string');
      });

      const validToken = signToken(payload);
      const tamperedToken = validToken.substring(0, validToken.length - 5) + 'xxxxx';

      assert.throws(() => {
        verifyToken(tamperedToken);
      });
    });
  });
});

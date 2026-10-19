// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/security/password.ts
// Security Utility: Password Hashing & Verification (Rule 14)
// ============================================================================

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password using bcrypt.
 * 
 * @param password Plaintext password to hash
 * @returns Resolves to hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against an existing bcrypt hash.
 * 
 * @param password Plaintext password to verify
 * @param hash Stored bcrypt hash
 * @returns Resolves to true if password matches hash, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

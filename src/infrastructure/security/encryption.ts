// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/security/encryption.ts
// Security: AES-256-GCM Credential Encryption & Decryption
// ============================================================================

import crypto from 'node:crypto';

export interface EncryptedData {
  encryptedPassword: string;
  encryptionIv: string;
  encryptionTag: string;
}

export function getMasterKey(): Buffer {
  const keyHex = process.env['ENCRYPTION_MASTER_KEY'];
  if (!keyHex) {
    throw new Error('ENCRYPTION_MASTER_KEY is not defined in environment variables');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be exactly 32 bytes (64 hex characters)');
  }
  return key;
}

export function encryptPassword(password: string): EncryptedData {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    encryptedPassword: encrypted,
    encryptionIv: iv.toString('hex'),
    encryptionTag: tag.toString('hex'),
  };
}

export function decryptPassword(encrypted: EncryptedData): string {
  const key = getMasterKey();
  const iv = Buffer.from(encrypted.encryptionIv, 'hex');
  const tag = Buffer.from(encrypted.encryptionTag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted.encryptedPassword, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

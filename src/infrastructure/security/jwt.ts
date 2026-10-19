import 'dotenv/config';
import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  userId: string;
  tenantId: string;
  role: string;
}

const JWT_EXPIRES_IN = '24h';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || 'c8e6a10df3a8d9b4b0e5138241fbbfa0821c1743a6d962ef90ba3909e4d58a17';
  return secret;
}

/**
 * Signs a new JSON Web Token containing authenticated user context.
 * 
 * @param payload Object containing userId, tenantId, and role
 * @returns Encoded JWT string with 24-hour expiration
 */
export function signToken(payload: AuthTokenPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    },
    secret,
    {
      expiresIn: JWT_EXPIRES_IN,
    }
  );
}

/**
 * Verifies and decodes a JSON Web Token.
 * 
 * @param token Encoded JWT string
 * @returns Decoded AuthTokenPayload
 * @throws Error if token is invalid, expired or signature verification fails
 */
export function verifyToken(token: string): AuthTokenPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret) as jwt.JwtPayload;

  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.tenantId !== 'string' ||
    typeof decoded.role !== 'string'
  ) {
    throw new Error('Invalid token payload structure');
  }

  return {
    userId: decoded.userId,
    tenantId: decoded.tenantId,
    role: decoded.role,
  };
}

export interface TempTokenPayload {
  userId: string;
  tenantId: string;
  purpose: 'DEVICE_VERIFICATION';
}

const TEMP_TOKEN_EXPIRES_IN = '10m';

/**
 * Signs a temporary 10-minute JWT token strictly for device verification.
 * Does not contain user role and cannot be used for general API access.
 */
export function signTempToken(payload: { userId: string; tenantId: string }): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      purpose: 'DEVICE_VERIFICATION',
    },
    secret,
    {
      expiresIn: TEMP_TOKEN_EXPIRES_IN,
    }
  );
}

/**
 * Verifies and decodes a temporary device verification token.
 */
export function verifyTempToken(token: string): TempTokenPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret) as jwt.JwtPayload;

  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.tenantId !== 'string' ||
    decoded.purpose !== 'DEVICE_VERIFICATION'
  ) {
    throw new Error('Invalid temporary token structure');
  }

  return {
    userId: decoded.userId,
    tenantId: decoded.tenantId,
    purpose: 'DEVICE_VERIFICATION',
  };
}


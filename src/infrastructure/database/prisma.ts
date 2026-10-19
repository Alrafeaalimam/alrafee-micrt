// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/database/prisma.ts
// Database: PrismaClient Singleton Instance with PostgreSQL Driver Adapter
// ============================================================================

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Ensure BigInt values can be serialized to JSON safely
(BigInt.prototype as any).toJSON = function () {
  const n = Number(this);
  return Number.isSafeInteger(n) ? n : this.toString();
};

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPgPool(): pg.Pool {
  const rawUrl = process.env['DATABASE_URL'] ?? '';
  // Strip sslmode from URL so pg doesn't override ssl: { rejectUnauthorized: false }
  const connectionString = rawUrl.replace(/([?&])sslmode=[^&]*(&|$)/, '$1').replace(/[?&]$/, '');
  const isLocal = connectionString.includes('127.0.0.1') || connectionString.includes('localhost');
  return new pg.Pool({
    connectionString,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
}

export const pgPool = createPgPool();

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(pgPool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/database/seed.ts
// Database Seeder: Provisions single default Tenant & Admin user with bcrypt hash (Rule 14)
// ============================================================================

import 'dotenv/config';
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { hashPassword } from '../security/password.js';

export const DEFAULT_TENANT_SLUG = 'default';
export const PLATFORM_TENANT_SLUG = 'soft-zone-platform';

/**
 * Generates a cryptographically strong, non-ambiguous random password.
 */
export function generateStrongPassword(length = 16): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*+-=';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    const b = bytes[i];
    if (b !== undefined) {
      password += chars[b % chars.length];
    }
  }
  return password;
}

type SeedDbClient = Pick<typeof prisma, 'tenant' | 'user' | 'platformSettings'>;

// Matches Prisma Migrate's official PostgreSQL advisory lock ID (0x04556d49)
const PRISMA_MIGRATE_ADVISORY_LOCK_ID = 72707369;

export async function seedDefaultUser(tenantId: string, db: SeedDbClient = prisma): Promise<string> {
  const DEFAULT_ADMIN_USERNAME = 'admin';
  let user = await db.user.findFirst({
    where: { tenantId, username: DEFAULT_ADMIN_USERNAME },
  });

  if (!user) {
    const rawPassword = generateStrongPassword(16);
    const passwordHash = await hashPassword(rawPassword);

    user = await db.user.create({
      data: {
        tenantId,
        username: DEFAULT_ADMIN_USERNAME,
        fullName: 'مدير النظام',
        passwordHash,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
    });

    console.log('\n======================================================================');
    console.log('[SEED AUTH] Default Admin user created successfully!');
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`Username : ${DEFAULT_ADMIN_USERNAME}`);
    console.log(`Password : ${rawPassword}`);
    console.log('(Please record this password securely. It will NOT be shown again.)');
    console.log('======================================================================\n');
  } else if (user.passwordHash.includes('dummy')) {
    // Migrate existing development dummy user to real hashed credentials
    const rawPassword = generateStrongPassword(16);
    const passwordHash = await hashPassword(rawPassword);

    user = await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: 'ACTIVE',
      },
    });

    console.log('\n======================================================================');
    console.log('[SEED AUTH] Existing Admin user upgraded with secure credentials!');
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`Username : ${DEFAULT_ADMIN_USERNAME}`);
    console.log(`Password : ${rawPassword}`);
    console.log('(Please record this password securely. It will NOT be shown again.)');
    console.log('======================================================================\n');
  }

  return user.id;
}

export async function seedSuperAdminUser(
  platformTenantId: string,
  db: SeedDbClient = prisma
): Promise<{ userId: string; rawPassword?: string }> {
  const SUPER_ADMIN_USERNAME = 'superadmin';
  const SUPER_ADMIN_EMAIL = 'alrafeaalimam@gmail.com';
  let user = await db.user.findFirst({
    where: { tenantId: platformTenantId, username: SUPER_ADMIN_USERNAME },
  });

  if (!user) {
    const emailTaken = await db.user.findFirst({
      where: { tenantId: platformTenantId, email: SUPER_ADMIN_EMAIL },
    });
    const rawPassword = generateStrongPassword(20);
    const passwordHash = await hashPassword(rawPassword);

    user = await db.user.create({
      data: {
        tenantId: platformTenantId,
        username: SUPER_ADMIN_USERNAME,
        fullName: 'المدير العام للمنصة (SOFT ZONE)',
        email: emailTaken ? null : SUPER_ADMIN_EMAIL,
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    console.log('\n======================================================================');
    console.log('[SEED AUTH] SUPER_ADMIN User Created Successfully!');
    console.log(`Platform Tenant ID: ${platformTenantId}`);
    console.log(`Username          : ${SUPER_ADMIN_USERNAME}`);
    console.log(`Password          : ${rawPassword}`);
    console.log('(Please record this password securely. It will NOT be shown again.)');
    console.log('======================================================================\n');

    return { userId: user.id, rawPassword };
  } else if (user.email !== SUPER_ADMIN_EMAIL) {
    const emailTaken = await db.user.findFirst({
      where: { tenantId: platformTenantId, email: SUPER_ADMIN_EMAIL, id: { not: user.id } },
    });
    if (!emailTaken) {
      user = await db.user.update({
        where: { id: user.id },
        data: { email: SUPER_ADMIN_EMAIL },
      });
    }
  }

  return { userId: user.id };
}

export async function seedPlatformTenant(db: SeedDbClient = prisma): Promise<string> {
  let tenant = await db.tenant.findUnique({
    where: { slug: PLATFORM_TENANT_SLUG },
  });

  if (!tenant) {
    tenant = await db.tenant.create({
      data: {
        name: 'SOFT ZONE Platform',
        slug: PLATFORM_TENANT_SLUG,
        currency: 'SDG',
        subscriptionStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
        maxRoutersLimit: 999999,
      },
    });
    console.log(`[Seed] Created platform tenant. ID: ${tenant.id}`);
  } else {
    if (tenant.approvalStatus !== 'APPROVED') {
      await db.tenant.update({
        where: { id: tenant.id },
        data: { approvalStatus: 'APPROVED' },
      });
    }
    console.log(`[Seed] Platform tenant already exists. ID: ${tenant.id}`);
  }

  await seedSuperAdminUser(tenant.id, db);

  return tenant.id;
}

async function seedDefaultTenantInternal(db: SeedDbClient): Promise<string> {
  let tenant = await db.tenant.findUnique({
    where: { slug: DEFAULT_TENANT_SLUG },
  });

  if (!tenant) {
    tenant = await db.tenant.create({
      data: {
        name: 'SOFT ZONE - Default',
        slug: DEFAULT_TENANT_SLUG,
        currency: 'SDG',
        approvalStatus: 'APPROVED',
      },
    });
    console.log(`[Seed] Created default tenant. ID: ${tenant.id}`);
  } else {
    if (tenant.approvalStatus !== 'APPROVED') {
      await db.tenant.update({
        where: { id: tenant.id },
        data: { approvalStatus: 'APPROVED' },
      });
    }
    console.log(`[Seed] Default tenant already exists. ID: ${tenant.id}`);
  }

  await seedDefaultUser(tenant.id, db);
  await seedPlatformTenant(db);

  return tenant.id;
}

export async function seedDefaultTenant(db?: SeedDbClient): Promise<string> {
  if (db) {
    return seedDefaultTenantInternal(db);
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s';`);
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${PRISMA_MIGRATE_ADVISORY_LOCK_ID});`);
      return seedDefaultTenantInternal(tx);
    },
    { timeout: 30000 }
  );
}

export async function seedPlatformSettings(db: SeedDbClient = prisma): Promise<void> {
  const existing = await db.platformSettings.findFirst();
  if (!existing) {
    await db.platformSettings.create({
      data: {
        id: 'default-platform-settings',
        supportEmail: 'jalsahnetwork@gmail.com',
        whatsappNumbers: ['0115715672', '0115715651'],
        primaryColorHex: '#3B2FA0',
        accentColorHex: '#F5C94B',
        appName: 'Jalsah',
      },
    });
    console.log('[Seed] Created default platform settings.');
  }
}

export async function seedAll(): Promise<{ defaultTenantId: string; platformTenantId: string }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s';`);
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${PRISMA_MIGRATE_ADVISORY_LOCK_ID});`);
      const defaultTenantId = await seedDefaultTenantInternal(tx);
      const platformTenantId = await seedPlatformTenant(tx);
      await seedPlatformSettings(tx);
      return { defaultTenantId, platformTenantId };
    },
    { timeout: 30000 }
  );
}

const isDirectExecution =
  process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');

if (isDirectExecution) {
  seedAll()
    .then((result) => {
      console.log(`[Seed Complete] Default: ${result.defaultTenantId}, Platform: ${result.platformTenantId}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed Error]:', err);
      process.exit(1);
    });
}

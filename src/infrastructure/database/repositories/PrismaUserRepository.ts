// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/database/repositories/PrismaUserRepository.ts
// Repository Implementation: Prisma User Entity Access (Rule 16)
// ============================================================================

import crypto from 'node:crypto';
import { prisma as defaultPrisma } from '../prisma.js';
import { PrismaClient } from '@prisma/client/wasm.js';
import {
  IUserRepository,
  User,
  CreateStaffUserInput,
} from '../../../application/interfaces/IUserRepository.js';

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findByUsername(username: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { username },
    });

    if (!user) return null;
    return this.mapToUser(user);
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    const trimmed = identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: trimmed, mode: 'insensitive' } },
          { email: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) return null;
    return this.mapToUser(user);
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) return null;
    return this.mapToUser(user);
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) return null;
    return this.mapToUser(user);
  }

  async findByTenantAndUsername(
    tenantId: string,
    username: string
  ): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { tenantId, username },
    });

    if (!user) return null;
    return this.mapToUser(user);
  }

  async updateLastLogin(id: string, ip?: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip ?? null,
      },
    });
  }

  async createStaffUser(input: CreateStaffUserInput): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        id: input.id ?? crypto.randomUUID(),
        tenantId: input.tenantId,
        username: input.username,
        email: input.email ?? null,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        phone: input.phone ?? null,
        role: input.role as any,
        status: 'ACTIVE',
      },
    });

    return this.mapToUser(user);
  }

  async findAllByTenant(tenantId: string): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => this.mapToUser(u));
  }

  async updateRole(id: string, _tenantId: string, role: string): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        role: role as any,
      },
    });

    return this.mapToUser(user);
  }

  async deactivateUser(id: string, _tenantId: string): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: 'INACTIVE',
      },
    });

    return this.mapToUser(user);
  }

  private mapToUser(user: any): User {
    return {
      id: user.id,
      tenantId: user.tenantId,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

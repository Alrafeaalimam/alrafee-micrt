// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/database/repositories/PrismaRouterRepository.ts
// Infrastructure Adapter: Prisma PostgreSQL Implementation of IRouterRepository
// Master Reference: Rule 16 (Adapters), Rule 19 (Security)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import {
  IRouterRepository,
  Router,
  CreateRouterData,
  UpdateRouterData,
} from '../../../application/interfaces/IRouterRepository.js';
import { encryptPassword } from '../../security/encryption.js';

export class PrismaRouterRepository implements IRouterRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async create(data: CreateRouterData): Promise<Router> {
    const encrypted = encryptPassword(data.password);

    const record = await this.prisma.router.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        host: data.host,
        apiPort: data.apiPort ?? 8729,
        connectionMethod: (data.connectionMethod as any) ?? 'ROUTEROS_API_SSL',
        backupEnabled: data.backupEnabled ?? true,
        metadata: data.metadata ?? null,
        credentials: {
          create: {
            username: data.username,
            encryptedPassword: encrypted.encryptedPassword,
            encryptionIv: encrypted.encryptionIv,
            encryptionTag: encrypted.encryptionTag,
            keyVersion: 1,
          },
        },
      },
      include: {
        credentials: true,
      },
    });

    return this.mapToRouter(record);
  }

  async findById(id: string, tenantId: string): Promise<Router | null> {
    const record = await this.prisma.router.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        credentials: true,
      },
    });

    if (!record) return null;
    return this.mapToRouter(record);
  }

  async findAllByTenant(tenantId: string): Promise<Router[]> {
    const records = await this.prisma.router.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        credentials: true,
      },
    });

    return records.map((record) => this.mapToRouter(record));
  }

  async update(id: string, tenantId: string, data: UpdateRouterData): Promise<Router> {
    const existing = await this.prisma.router.findFirst({
      where: { id, tenantId },
      include: { credentials: true },
    });

    if (!existing) {
      throw new Error(`Router with id ${id} not found for tenant ${tenantId}`);
    }

    const updateRouterData: any = {};
    if (data.name !== undefined) updateRouterData.name = data.name;
    if (data.host !== undefined) updateRouterData.host = data.host;
    if (data.apiPort !== undefined) updateRouterData.apiPort = data.apiPort;
    if (data.connectionMethod !== undefined) updateRouterData.connectionMethod = data.connectionMethod;
    if (data.status !== undefined) updateRouterData.status = data.status;
    if (data.backupEnabled !== undefined) updateRouterData.backupEnabled = data.backupEnabled;
    if (data.metadata !== undefined) updateRouterData.metadata = data.metadata;

    if (data.username !== undefined || data.password !== undefined) {
      const credentialsUpdate: any = {};
      if (data.username !== undefined) {
        credentialsUpdate.username = data.username;
      }
      if (data.password !== undefined) {
        const encrypted = encryptPassword(data.password);
        credentialsUpdate.encryptedPassword = encrypted.encryptedPassword;
        credentialsUpdate.encryptionIv = encrypted.encryptionIv;
        credentialsUpdate.encryptionTag = encrypted.encryptionTag;
      }

      updateRouterData.credentials = {
        upsert: {
          create: {
            username: data.username ?? existing.credentials?.username ?? 'admin',
            encryptedPassword:
              credentialsUpdate.encryptedPassword ??
              existing.credentials?.encryptedPassword ??
              '',
            encryptionIv:
              credentialsUpdate.encryptionIv ??
              existing.credentials?.encryptionIv ??
              '',
            encryptionTag:
              credentialsUpdate.encryptionTag ??
              existing.credentials?.encryptionTag ??
              '',
            keyVersion: 1,
          },
          update: credentialsUpdate,
        },
      };
    }

    const updated = await this.prisma.router.update({
      where: { id },
      data: updateRouterData,
      include: {
        credentials: true,
      },
    });

    return this.mapToRouter(updated);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.prisma.router.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new Error(`Router with id ${id} not found for tenant ${tenantId}`);
    }

    await this.prisma.router.delete({
      where: { id },
    });
  }

  private mapToRouter(record: any): Router {
    return {
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      host: record.host,
      apiPort: record.apiPort,
      connectionMethod: record.connectionMethod,
      status: record.status,
      routerOsVersion: record.routerOsVersion,
      boardModel: record.boardModel,
      serialNumber: record.serialNumber,
      cpuLoadPercentage: record.cpuLoadPercentage,
      freeMemoryBytes: record.freeMemoryBytes,
      totalMemoryBytes: record.totalMemoryBytes,
      uptimeSeconds: record.uptimeSeconds,
      lastSeenAt: record.lastSeenAt,
      lastHealthCheckAt: record.lastHealthCheckAt,
      lastErrorMessage: record.lastErrorMessage,
      backupEnabled: record.backupEnabled,
      metadata: record.metadata,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      credentials: record.credentials
        ? {
            id: record.credentials.id,
            routerId: record.credentials.routerId,
            username: record.credentials.username,
            keyVersion: record.credentials.keyVersion,
            certificateAuth: record.credentials.certificateAuth,
            updatedAt: record.credentials.updatedAt,
          }
        : null,
    };
  }
}

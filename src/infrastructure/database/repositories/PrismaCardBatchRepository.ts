// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/database/repositories/PrismaCardBatchRepository.ts
// Infrastructure Adapter: Prisma PostgreSQL Implementation of ICardBatchRepository
// Master Reference: Rule 16 (Adapters), Rule 19 (Multi-Tenancy)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import {
  ICardBatchRepository,
  CardBatch,
  CreateCardBatchData,
} from '../../../application/interfaces/ICardBatchRepository.js';

export class PrismaCardBatchRepository implements ICardBatchRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async create(data: CreateCardBatchData): Promise<CardBatch> {
    const record = await this.prisma.cardBatch.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        tenantId: data.tenantId,
        packageId: data.packageId,
        createdById: data.createdById,
        batchNumber: data.batchNumber,
        name: data.name,
        quantity: data.quantity,
        prefix: data.prefix ?? null,
        userLength: data.userLength ?? 6,
        passwordLength: data.passwordLength ?? 4,
        unitPrice: data.unitPrice,
        totalPrice: data.totalPrice,
      },
    });

    return this.mapToCardBatch(record);
  }

  async findById(id: string, tenantId: string): Promise<CardBatch | null> {
    const record = await this.prisma.cardBatch.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!record) return null;
    return this.mapToCardBatch(record);
  }

  async findAllByTenant(tenantId: string): Promise<CardBatch[]> {
    const records = await this.prisma.cardBatch.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return records.map((r) => this.mapToCardBatch(r));
  }

  private mapToCardBatch(record: any): CardBatch {
    return {
      id: record.id,
      tenantId: record.tenantId,
      packageId: record.packageId,
      createdById: record.createdById,
      batchNumber: record.batchNumber,
      name: record.name,
      quantity: record.quantity,
      prefix: record.prefix,
      userLength: record.userLength,
      passwordLength: record.passwordLength,
      unitPrice:
        typeof record.unitPrice === 'number'
          ? record.unitPrice
          : Number(record.unitPrice),
      totalPrice:
        typeof record.totalPrice === 'number'
          ? record.totalPrice
          : Number(record.totalPrice),
      isExported: record.isExported,
      exportedAt: record.exportedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

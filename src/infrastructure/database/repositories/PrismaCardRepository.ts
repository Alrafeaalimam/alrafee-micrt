// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/database/repositories/PrismaCardRepository.ts
// Infrastructure Adapter: Prisma PostgreSQL Implementation of ICardRepository
// Master Reference: Rule 9 (Cards), Rule 16 (Adapters), Rule 19 (Security)
// ============================================================================

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../prisma.js';
import {
  ICardRepository,
  Card,
  CreateCardData,
  FindCardsFilter,
} from '../../../application/interfaces/ICardRepository.js';
import {
  CardStateMachine,
  CardStatus,
} from '../../../domain/state-machines/CardStateMachine.js';

export class PrismaCardRepository implements ICardRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async createMany(cards: CreateCardData[]): Promise<Card[]> {
    if (cards.length === 0) return [];

    const mappedData = cards.map((c) => ({
      id: c.id ?? crypto.randomUUID(),
      tenantId: c.tenantId,
      batchId: c.batchId,
      packageId: c.packageId,
      routerId: c.routerId ?? null,
      username: c.username,
      password: c.password,
      status: (c.status ?? 'GENERATED') as any,
      price: c.price,
    }));

    try {
      const records = await (this.prisma.card as any).createManyAndReturn({
        data: mappedData,
      });
      return records.map((r: any) => this.mapToCard(r));
    } catch {
      await this.prisma.card.createMany({
        data: mappedData,
      });
      const records = await this.prisma.card.findMany({
        where: {
          id: { in: mappedData.map((c) => c.id) },
        },
      });
      return records.map((r: any) => this.mapToCard(r));
    }
  }

  async findById(id: string, tenantId: string): Promise<Card | null> {
    const record = await this.prisma.card.findFirst({
      where: { id, tenantId },
    });

    if (!record) return null;
    return this.mapToCard(record);
  }

  async findByIds(ids: string[], tenantId: string): Promise<Card[]> {
    if (ids.length === 0) return [];
    const records = await this.prisma.card.findMany({
      where: {
        id: { in: ids },
        tenantId,
      },
    });

    return records.map((r) => this.mapToCard(r));
  }

  async findByBatchId(batchId: string, tenantId: string): Promise<Card[]> {
    const records = await this.prisma.card.findMany({
      where: {
        batchId,
        tenantId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return records.map((r) => this.mapToCard(r));
  }

  async findAllByTenant(
    tenantId: string,
    filter?: FindCardsFilter
  ): Promise<Card[]> {
    const where: any = { tenantId };
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.batchId) {
      where.batchId = filter.batchId;
    }

    const records = await this.prisma.card.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return records.map((r) => this.mapToCard(r));
  }

  async updateStatus(
    id: string,
    tenantId: string,
    newStatus: CardStatus
  ): Promise<Card> {
    const existing = await this.prisma.card.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new Error(`Card with id ${id} not found for tenant ${tenantId}`);
    }

    // STRICT DOMAIN GOVERNANCE: Must pass through CardStateMachine.transition()
    // Throws InvalidCardTransitionException if forbidden
    const validatedStatus = CardStateMachine.transition(
      existing.status as CardStatus,
      newStatus
    );

    const updated = await this.prisma.card.update({
      where: { id },
      data: { status: validatedStatus },
    });

    return this.mapToCard(updated);
  }

  private mapToCard(record: any): Card {
    return {
      id: record.id,
      tenantId: record.tenantId,
      batchId: record.batchId,
      packageId: record.packageId,
      routerId: record.routerId,
      username: record.username,
      password: record.password,
      status: record.status as CardStatus,
      price:
        typeof record.price === 'number'
          ? record.price
          : Number(record.price),
      firstLoginAt: record.firstLoginAt,
      expiresAt: record.expiresAt,
      totalUsedSeconds: record.totalUsedSeconds,
      totalBytesIn: record.totalBytesIn,
      totalBytesOut: record.totalBytesOut,
      boundMacAddress: record.boundMacAddress,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

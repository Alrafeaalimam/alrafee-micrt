// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/infrastructure/database/repositories/PrismaSaleRepository.ts
// Infrastructure Adapter: Prisma PostgreSQL Implementation of ISaleRepository
// Master Reference: Rule 8 (Sales), Rule 9 (Cards Lifecycle), Rule 16 (Adapters)
// ============================================================================

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import {
  ISaleRepository,
  Sale,
  SaleItem,
  CreateSaleInput,
  PaymentMethod,
} from '../../../application/interfaces/ISaleRepository.js';

export class PrismaSaleRepository implements ISaleRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Atomically records a Sale, creates its SaleItems, and updates each Card status to SOLD
   * within an isolated Prisma transaction. All succeed or all roll back.
   */
  async create(data: CreateSaleInput): Promise<Sale> {
    const saleId = data.id ?? crypto.randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create the Sale record along with associated SaleItems
      const saleRecord = await tx.sale.create({
        data: {
          id: saleId,
          tenantId: data.tenantId,
          soldById: data.soldById,
          totalAmount: data.totalAmount,
          paymentMethod: data.paymentMethod as any,
          items: {
            create: data.items.map((item) => ({
              id: crypto.randomUUID(),
              cardId: item.cardId,
              unitPrice: item.unitPrice,
            })),
          },
        },
        include: {
          items: {
            include: {
              card: {
                select: {
                  id: true,
                  username: true,
                  status: true,
                  price: true,
                },
              },
            },
          },
        },
      });

      // 2. Atomically update each card's status to 'SOLD'
      for (const item of data.items) {
        await tx.card.update({
          where: {
            id: item.cardId,
            tenantId: data.tenantId,
          },
          data: {
            status: 'SOLD',
          },
        });
      }

      return saleRecord;
    });

    return this.mapToSale(result);
  }

  /**
   * Retrieves all sales for a tenant, optionally filtered by date range.
   */
  async findAllByTenant(
    tenantId: string,
    dateFrom?: Date | undefined,
    dateTo?: Date | undefined
  ): Promise<Sale[]> {
    const where: any = { tenantId };

    if (dateFrom !== undefined || dateTo !== undefined) {
      where.createdAt = {};
      if (dateFrom !== undefined) {
        where.createdAt.gte = dateFrom;
      }
      if (dateTo !== undefined) {
        where.createdAt.lte = dateTo;
      }
    }

    const records = await this.prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            card: {
              select: {
                id: true,
                username: true,
                status: true,
                price: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return records.map((r) => this.mapToSale(r));
  }

  /**
   * Computes the aggregated total revenue of sales created today (00:00:00 to 23:59:59.999).
   */
  async getTodaySalesTotal(tenantId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const aggregate = await this.prisma.sale.aggregate({
      where: {
        tenantId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      _sum: {
        totalAmount: true,
      },
    });

    const sum = aggregate._sum.totalAmount;
    if (!sum) return 0;
    return typeof sum === 'number' ? sum : Number(sum);
  }

  private mapToSale(record: any): Sale {
    return {
      id: record.id,
      tenantId: record.tenantId,
      soldById: record.soldById,
      totalAmount:
        typeof record.totalAmount === 'number'
          ? record.totalAmount
          : Number(record.totalAmount),
      paymentMethod: record.paymentMethod as PaymentMethod,
      createdAt: record.createdAt,
      items: (record.items || []).map(
        (item: any): SaleItem => ({
          id: item.id,
          saleId: item.saleId,
          cardId: item.cardId,
          unitPrice:
            typeof item.unitPrice === 'number'
              ? item.unitPrice
              : Number(item.unitPrice),
          card: item.card
            ? {
                id: item.card.id,
                username: item.card.username,
                status: item.card.status,
                price:
                  typeof item.card.price === 'number'
                    ? item.card.price
                    : Number(item.card.price),
              }
            : undefined,
        })
      ),
    };
  }
}

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/application/SaleUseCases.test.ts
// Unit Tests: Sale Use Cases, Card State Machine Transitions, and Calculations
// Test Runner: Node.js Built-in Test Runner via tsx
// Master Reference: Rule 8 (Sales), Rule 9 (Cards Lifecycle), Rule 16 (Clean Architecture)
// ============================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ISaleRepository,
  Sale,
  SaleItem,
  CreateSaleInput,
  PaymentMethod,
} from '../../src/application/interfaces/ISaleRepository.js';
import {
  ICardRepository,
  Card,
  CreateCardData,
  FindCardsFilter,
} from '../../src/application/interfaces/ICardRepository.js';
import { IAuditLogger } from '../../src/application/interfaces/IAuditLogger.js';
import { CreateSaleUseCase } from '../../src/application/use-cases/sales/CreateSaleUseCase.js';
import { GetTodaySalesUseCase } from '../../src/application/use-cases/sales/GetTodaySalesUseCase.js';
import { ListSalesUseCase } from '../../src/application/use-cases/sales/ListSalesUseCase.js';
import {
  CardStateMachine,
  CardStatus,
} from '../../src/domain/state-machines/CardStateMachine.js';

// In-Memory Test Fakes
class InMemoryAuditLogger implements IAuditLogger {
  public logs: Array<{
    tenantId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    description: string;
    result: string;
  }> = [];

  async log(
    tenantId: string,
    userId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    description: string,
    result: string = 'SUCCESS'
  ): Promise<void> {
    this.logs.push({
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      description,
      result,
    });
  }

  clear(): void {
    this.logs = [];
  }
}

class InMemoryCardRepository implements ICardRepository {
  public cards: Card[] = [];

  async createMany(cardsData: CreateCardData[]): Promise<Card[]> {
    const createdList: Card[] = [];
    for (const c of cardsData) {
      const card: Card = {
        id: c.id ?? `card-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        tenantId: c.tenantId,
        batchId: c.batchId,
        packageId: c.packageId,
        routerId: c.routerId ?? null,
        username: c.username,
        password: c.password,
        status: c.status ?? 'GENERATED',
        price: c.price,
        firstLoginAt: null,
        expiresAt: null,
        totalUsedSeconds: BigInt(0),
        totalBytesIn: BigInt(0),
        totalBytesOut: BigInt(0),
        boundMacAddress: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.cards.push(card);
      createdList.push({ ...card });
    }
    return createdList;
  }

  async findById(id: string, tenantId: string): Promise<Card | null> {
    const found = this.cards.find((c) => c.id === id && c.tenantId === tenantId);
    return found ? { ...found } : null;
  }

  async findByIds(ids: string[], tenantId: string): Promise<Card[]> {
    const idSet = new Set(ids);
    return this.cards
      .filter((c) => idSet.has(c.id) && c.tenantId === tenantId)
      .map((c) => ({ ...c }));
  }

  async findByBatchId(batchId: string, tenantId: string): Promise<Card[]> {
    return this.cards
      .filter((c) => c.batchId === batchId && c.tenantId === tenantId)
      .map((c) => ({ ...c }));
  }

  async findAllByTenant(tenantId: string, filter?: FindCardsFilter): Promise<Card[]> {
    let result = this.cards.filter((c) => c.tenantId === tenantId);
    if (filter?.status) {
      result = result.filter((c) => c.status === filter.status);
    }
    if (filter?.batchId) {
      result = result.filter((c) => c.batchId === filter.batchId);
    }
    return result.map((c) => ({ ...c }));
  }

  async updateStatus(id: string, tenantId: string, newStatus: CardStatus): Promise<Card> {
    const card = this.cards.find((c) => c.id === id && c.tenantId === tenantId);
    if (!card) {
      throw new Error(`Card with id ${id} not found for tenant ${tenantId}`);
    }
    const validatedStatus = CardStateMachine.transition(card.status, newStatus);
    card.status = validatedStatus;
    card.updatedAt = new Date();
    return { ...card };
  }
}

class InMemorySaleRepository implements ISaleRepository {
  public sales: Sale[] = [];
  public soldCardIds: Set<string> = new Set();
  public cardRepo?: InMemoryCardRepository;

  constructor(cardRepo?: InMemoryCardRepository) {
    this.cardRepo = cardRepo;
  }

  async create(data: CreateSaleInput): Promise<Sale> {
    // Check for duplicate sales of the same card (simulate unique constraint)
    for (const item of data.items) {
      if (this.soldCardIds.has(item.cardId)) {
        const error: any = new Error(
          `Unique constraint failed on the fields: (cardId)`
        );
        error.code = 'P2002';
        throw error;
      }
    }

    const saleId = data.id ?? `sale-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const items: SaleItem[] = data.items.map((i) => {
      this.soldCardIds.add(i.cardId);
      const card = this.cardRepo?.cards.find((c) => c.id === i.cardId);
      return {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        saleId,
        cardId: i.cardId,
        unitPrice: i.unitPrice,
        card: card
          ? {
              id: card.id,
              username: card.username,
              status: 'SOLD',
              price: card.price,
            }
          : undefined,
      };
    });

    // Update cards to SOLD in memory if repo attached
    if (this.cardRepo) {
      for (const item of data.items) {
        const card = this.cardRepo.cards.find((c) => c.id === item.cardId);
        if (card) {
          card.status = 'SOLD';
          card.updatedAt = new Date();
        }
      }
    }

    const sale: Sale = {
      id: saleId,
      tenantId: data.tenantId,
      soldById: data.soldById,
      totalAmount: data.totalAmount,
      paymentMethod: data.paymentMethod,
      createdAt: new Date(),
      items,
    };

    this.sales.push(sale);
    return { ...sale };
  }

  async findAllByTenant(
    tenantId: string,
    dateFrom?: Date | undefined,
    dateTo?: Date | undefined
  ): Promise<Sale[]> {
    return this.sales.filter((s) => {
      if (s.tenantId !== tenantId) return false;
      if (dateFrom && s.createdAt < dateFrom) return false;
      if (dateTo && s.createdAt > dateTo) return false;
      return true;
    });
  }

  async getTodaySalesTotal(tenantId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todaySales = this.sales.filter(
      (s) =>
        s.tenantId === tenantId &&
        s.createdAt >= startOfDay &&
        s.createdAt <= endOfDay
    );

    const total = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
    return Math.round(total * 100) / 100;
  }
}

describe('Sale Use Cases & Card State Machine Unit Tests', () => {
  const tenantId = 'test-tenant-uuid';
  const soldById = 'test-user-admin';

  let cardRepo: InMemoryCardRepository;
  let saleRepo: InMemorySaleRepository;
  let auditLogger: InMemoryAuditLogger;
  let createSaleUseCase: CreateSaleUseCase;
  let getTodaySalesUseCase: GetTodaySalesUseCase;
  let listSalesUseCase: ListSalesUseCase;

  beforeEach(() => {
    cardRepo = new InMemoryCardRepository();
    saleRepo = new InMemorySaleRepository(cardRepo);
    auditLogger = new InMemoryAuditLogger();
    createSaleUseCase = new CreateSaleUseCase(saleRepo, cardRepo, auditLogger);
    getTodaySalesUseCase = new GetTodaySalesUseCase(saleRepo);
    listSalesUseCase = new ListSalesUseCase(saleRepo);
  });

  describe('CreateSaleUseCase', () => {
    it('should successfully sell multiple AVAILABLE cards in a single transaction', async () => {
      const cards = await cardRepo.createMany([
        {
          id: 'card-1',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'USER01',
          password: 'PASS',
          status: 'AVAILABLE',
          price: 15.5,
        },
        {
          id: 'card-2',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'USER02',
          password: 'PASS',
          status: 'AVAILABLE',
          price: 25.0,
        },
        {
          id: 'card-3',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'USER03',
          password: 'PASS',
          status: 'AVAILABLE',
          price: 10.25,
        },
      ]);

      const sale = await createSaleUseCase.execute({
        tenantId,
        soldById,
        cardIds: ['card-1', 'card-2', 'card-3'],
        paymentMethod: 'CASH',
      });

      assert.ok(sale.id);
      assert.strictEqual(sale.tenantId, tenantId);
      assert.strictEqual(sale.soldById, soldById);
      assert.strictEqual(sale.paymentMethod, 'CASH');
      assert.strictEqual(sale.totalAmount, 50.75);
      assert.strictEqual(sale.items.length, 3);

      // Verify each card's status was updated to SOLD
      const card1 = await cardRepo.findById('card-1', tenantId);
      const card2 = await cardRepo.findById('card-2', tenantId);
      const card3 = await cardRepo.findById('card-3', tenantId);
      assert.strictEqual(card1?.status, 'SOLD');
      assert.strictEqual(card2?.status, 'SOLD');
      assert.strictEqual(card3?.status, 'SOLD');

      // Verify Audit Log entry
      assert.strictEqual(auditLogger.logs.length, 1);
      const log = auditLogger.logs[0]!;
      assert.strictEqual(log.tenantId, tenantId);
      assert.strictEqual(log.userId, soldById);
      assert.strictEqual(log.action, 'SELL_CARDS');
      assert.strictEqual(log.entityType, 'Sale');
      assert.strictEqual(log.entityId, sale.id);
      assert.strictEqual(log.result, 'SUCCESS');
      assert.ok(log.description.includes('50.75'));
    });

    it('should reject selling a card in GENERATED state with a clear error message', async () => {
      await cardRepo.createMany([
        {
          id: 'card-gen',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'UNPRINTED01',
          password: 'PASS',
          status: 'GENERATED',
          price: 20.0,
        },
      ]);

      await assert.rejects(
        async () => {
          await createSaleUseCase.execute({
            tenantId,
            soldById,
            cardIds: ['card-gen'],
            paymentMethod: 'CASH',
          });
        },
        (err: Error) => {
          assert.ok(
            err.message.includes('card-gen'),
            `Expected message to mention card-gen ID, got: ${err.message}`
          );
          assert.ok(
            err.message.includes('GENERATED'),
            `Expected message to mention GENERATED status, got: ${err.message}`
          );
          assert.ok(
            err.message.includes('not AVAILABLE'),
            `Expected message to state not AVAILABLE, got: ${err.message}`
          );
          return true;
        }
      );

      // Verify no sale was recorded
      assert.strictEqual(saleRepo.sales.length, 0);
      // Verify card status remains GENERATED
      const card = await cardRepo.findById('card-gen', tenantId);
      assert.strictEqual(card?.status, 'GENERATED');
    });

    it('should reject selling a card that is already SOLD with a clear error message', async () => {
      await cardRepo.createMany([
        {
          id: 'card-sold',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'ALREADY_SOLD',
          password: 'PASS',
          status: 'SOLD',
          price: 15.0,
        },
      ]);

      await assert.rejects(
        async () => {
          await createSaleUseCase.execute({
            tenantId,
            soldById,
            cardIds: ['card-sold'],
            paymentMethod: 'BANK_TRANSFER',
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('card-sold'));
          assert.ok(err.message.includes('SOLD'));
          return true;
        }
      );

      assert.strictEqual(saleRepo.sales.length, 0);
    });

    it('should reject sale atomically if any card in a batch is not AVAILABLE', async () => {
      await cardRepo.createMany([
        {
          id: 'card-avail-1',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'AVAIL01',
          password: 'PASS',
          status: 'AVAILABLE',
          price: 10.0,
        },
        {
          id: 'card-not-avail',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'NOTAVAIL02',
          password: 'PASS',
          status: 'GENERATED',
          price: 10.0,
        },
      ]);

      await assert.rejects(
        async () => {
          await createSaleUseCase.execute({
            tenantId,
            soldById,
            cardIds: ['card-avail-1', 'card-not-avail'],
            paymentMethod: 'CASH',
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('card-not-avail'));
          return true;
        }
      );

      // Verify atomic behavior: neither card was modified, no sale created
      const card1 = await cardRepo.findById('card-avail-1', tenantId);
      assert.strictEqual(card1?.status, 'AVAILABLE');
      assert.strictEqual(saleRepo.sales.length, 0);
    });

    it('should accurately calculate totalAmount with floating point prices', async () => {
      await cardRepo.createMany([
        {
          id: 'card-p1',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'PRICE01',
          password: 'PASS',
          status: 'AVAILABLE',
          price: 10.1,
        },
        {
          id: 'card-p2',
          tenantId,
          batchId: 'batch-1',
          packageId: 'pkg-1',
          username: 'PRICE02',
          password: 'PASS',
          status: 'AVAILABLE',
          price: 20.2,
        },
      ]);

      const sale = await createSaleUseCase.execute({
        tenantId,
        soldById,
        cardIds: ['card-p1', 'card-p2'],
        paymentMethod: 'MOBILE_MONEY',
      });

      // 10.1 + 20.2 in JS is 30.300000000000004 -> rounded should be exactly 30.3
      assert.strictEqual(sale.totalAmount, 30.3);
    });

    it('should reject when non-existent card ID is requested', async () => {
      await assert.rejects(
        async () => {
          await createSaleUseCase.execute({
            tenantId,
            soldById,
            cardIds: ['non-existent-id'],
            paymentMethod: 'CASH',
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          assert.ok(err.message.includes('non-existent-id'));
          return true;
        }
      );
    });

    it('should reject when duplicate card IDs are provided in request', async () => {
      await assert.rejects(
        async () => {
          await createSaleUseCase.execute({
            tenantId,
            soldById,
            cardIds: ['card-dup', 'card-dup'],
            paymentMethod: 'CASH',
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('Duplicate'));
          return true;
        }
      );
    });
  });

  describe('GetTodaySalesUseCase', () => {
    it('should return 0 when no sales have been recorded today', async () => {
      const result = await getTodaySalesUseCase.execute({ tenantId });
      assert.strictEqual(result.todayTotal, 0);
      assert.strictEqual(result.totalAmount, 0);
    });

    it('should return correct sum of sales created today', async () => {
      await saleRepo.create({
        tenantId,
        soldById,
        totalAmount: 100.5,
        paymentMethod: 'CASH',
        items: [{ cardId: 'c1', unitPrice: 100.5 }],
      });
      await saleRepo.create({
        tenantId,
        soldById,
        totalAmount: 49.5,
        paymentMethod: 'BANK_TRANSFER',
        items: [{ cardId: 'c2', unitPrice: 49.5 }],
      });

      const result = await getTodaySalesUseCase.execute({ tenantId });
      assert.strictEqual(result.todayTotal, 150.0);
      assert.strictEqual(result.totalAmount, 150.0);
    });
  });

  describe('ListSalesUseCase', () => {
    it('should list all sales for tenant with items', async () => {
      await saleRepo.create({
        tenantId,
        soldById,
        totalAmount: 100,
        paymentMethod: 'CASH',
        items: [{ cardId: 'c1', unitPrice: 100 }],
      });
      await saleRepo.create({
        tenantId,
        soldById,
        totalAmount: 200,
        paymentMethod: 'MOBILE_MONEY',
        items: [{ cardId: 'c2', unitPrice: 200 }],
      });

      const sales = await listSalesUseCase.execute({ tenantId });
      assert.strictEqual(sales.length, 2);
    });
  });
});

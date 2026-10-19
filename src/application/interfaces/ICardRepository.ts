// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/interfaces/ICardRepository.ts
// Application Interface: Card Repository Abstract Contract (Rule 16)
// ============================================================================

import { CardStatus } from '../../domain/state-machines/CardStateMachine.js';

export interface Card {
  id: string;
  tenantId: string;
  batchId: string;
  packageId: string;
  routerId?: string | null;
  username: string;
  password: string;
  status: CardStatus;
  price: number;
  firstLoginAt?: Date | null;
  expiresAt?: Date | null;
  totalUsedSeconds: bigint | number;
  totalBytesIn: bigint | number;
  totalBytesOut: bigint | number;
  boundMacAddress?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCardData {
  id?: string;
  tenantId: string;
  batchId: string;
  packageId: string;
  routerId?: string | null;
  username: string;
  password: string;
  status?: CardStatus;
  price: number;
}

export interface FindCardsFilter {
  status?: CardStatus | undefined;
  batchId?: string | undefined;
}

export interface ICardRepository {
  createMany(cards: CreateCardData[]): Promise<Card[]>;
  findById(id: string, tenantId: string): Promise<Card | null>;
  findByIds(ids: string[], tenantId: string): Promise<Card[]>;
  findByBatchId(batchId: string, tenantId: string): Promise<Card[]>;
  findAllByTenant(tenantId: string, filter?: FindCardsFilter): Promise<Card[]>;
  updateStatus(id: string, tenantId: string, newStatus: CardStatus): Promise<Card>;
}


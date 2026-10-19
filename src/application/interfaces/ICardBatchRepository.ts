// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/interfaces/ICardBatchRepository.ts
// Application Interface: CardBatch Repository Abstract Contract (Rule 16)
// ============================================================================

export interface CardBatch {
  id: string;
  tenantId: string;
  packageId: string;
  createdById: string;
  batchNumber: string;
  name: string;
  quantity: number;
  prefix?: string | null;
  userLength: number;
  passwordLength: number;
  unitPrice: number;
  totalPrice: number;
  isExported: boolean;
  exportedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCardBatchData {
  id?: string;
  tenantId: string;
  packageId: string;
  createdById: string;
  batchNumber: string;
  name: string;
  quantity: number;
  prefix?: string | null;
  userLength?: number;
  passwordLength?: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ICardBatchRepository {
  create(data: CreateCardBatchData): Promise<CardBatch>;
  findById(id: string, tenantId: string): Promise<CardBatch | null>;
  findAllByTenant(tenantId: string): Promise<CardBatch[]>;
}

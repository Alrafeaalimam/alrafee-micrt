// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/interfaces/ISaleRepository.ts
// Application Interface: Sale Repository Abstract Contract (Rule 8, Rule 16)
// ============================================================================

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY';

export interface SaleItemCard {
  id: string;
  username: string;
  status: string;
  price: number;
}

export interface SaleItem {
  id: string;
  saleId: string;
  cardId: string;
  unitPrice: number;
  card?: SaleItemCard | undefined;
}

export interface Sale {
  id: string;
  tenantId: string;
  soldById: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  items: SaleItem[];
}

export interface CreateSaleItemInput {
  cardId: string;
  unitPrice: number;
}

export interface CreateSaleInput {
  id?: string | undefined;
  tenantId: string;
  soldById: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  items: CreateSaleItemInput[];
}

export interface ISaleRepository {
  create(data: CreateSaleInput): Promise<Sale>;
  findAllByTenant(
    tenantId: string,
    dateFrom?: Date | undefined,
    dateTo?: Date | undefined
  ): Promise<Sale[]>;
  getTodaySalesTotal(tenantId: string): Promise<number>;
}

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/validators/sale.validator.ts
// Presentation Validator: Zod Schemas for Sale Operations
// Master Reference: Rule 8 (Sales), Rule 19 (Validation)
// ============================================================================

import { z } from 'zod';

export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
] as const;

export const createSaleSchema = z.object({
  cardIds: z
    .array(z.string().uuid('Each card ID must be a valid UUID'))
    .min(1, 'cardIds must contain at least one card ID'),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    message: 'Invalid payment method. Allowed: CASH, BANK_TRANSFER, MOBILE_MONEY',
  }),
});

export type CreateSaleBody = z.infer<typeof createSaleSchema>;

export const listSalesQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;

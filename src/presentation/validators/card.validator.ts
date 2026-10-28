// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/validators/card.validator.ts
// Presentation Validator: Zod Schemas for Card Operations
// Master Reference: Rule 19 (Validation)
// ============================================================================

import { z } from 'zod';

export const CARD_STATUSES = [
  'GENERATED',
  'AVAILABLE',
  'SOLD',
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
  'SUSPENDED',
  'REVOKED',
] as const;

export const generateBatchSchema = z.object({
  packageId: z.string().trim().min(1, 'Package ID is required'),
  routerId: z.string().trim().min(1).optional().nullable().or(z.literal('')),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be at least 1')
    .max(1000, 'Quantity cannot exceed 1000'),
  prefix: z
    .string()
    .trim()
    .max(10, 'Prefix cannot exceed 10 characters')
    .optional()
    .nullable()
    .or(z.literal('')),
  userLength: z.number().int().min(4).max(16).default(6).optional(),
  passwordLength: z.number().int().min(0).max(16).default(4).optional(),
  generationMode: z.enum(['USERNAME_AND_PASSWORD', 'NUMBERS_ONLY']).default('USERNAME_AND_PASSWORD').optional(),
});

export type GenerateBatchBody = z.infer<typeof generateBatchSchema>;

export const updateStatusSchema = z.object({
  newStatus: z.enum(CARD_STATUSES, { message: 'Invalid card status value' }),
});

export type UpdateStatusBody = z.infer<typeof updateStatusSchema>;

export const listCardsQuerySchema = z.object({
  status: z.enum(CARD_STATUSES).optional(),
  batchId: z.string().uuid('Batch ID must be a valid UUID').optional(),
});

export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;

export const cardIdParamsSchema = z.object({
  id: z.string().uuid('Card ID must be a valid UUID'),
});

export type CardIdParams = z.infer<typeof cardIdParamsSchema>;

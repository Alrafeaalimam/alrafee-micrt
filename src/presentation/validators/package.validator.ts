// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/validators/package.validator.ts
// Presentation Validator: Zod Schemas for Package Operations
// Master Reference: Rule 19 (Validation)
// ============================================================================

import { z } from 'zod';

export const createPackageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  code: z.string().trim().min(1, 'Code is required'),
  downloadSpeedLimit: z.string().trim().min(1, 'Download speed limit is required'),
  uploadSpeedLimit: z.string().trim().min(1, 'Upload speed limit is required'),
  durationMinutes: z.number().int().positive('Duration minutes must be a positive integer'),
  validityDays: z.number().int().positive('Validity days must be a positive integer'),
  dataLimitBytes: z.number().int().min(0, 'Data limit bytes must be >= 0').optional(),
  price: z.number().positive('Price must be a positive number'),
  hotspotProfileName: z.string().trim().min(1, 'Hotspot profile name is required'),
  currency: z.string().trim().min(1).optional(),
  simultaneousSessions: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export type CreatePackageBody = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = z.object({
  name: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).optional(),
  downloadSpeedLimit: z.string().trim().min(1).optional(),
  uploadSpeedLimit: z.string().trim().min(1).optional(),
  durationMinutes: z.number().int().positive().optional(),
  validityDays: z.number().int().positive().optional(),
  dataLimitBytes: z.number().int().min(0).optional(),
  price: z.number().positive().optional(),
  hotspotProfileName: z.string().trim().min(1).optional(),
  currency: z.string().trim().min(1).optional(),
  simultaneousSessions: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePackageBody = z.infer<typeof updatePackageSchema>;

export const packageIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'Package ID is required'),
});

export type PackageIdParams = z.infer<typeof packageIdParamsSchema>;

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/validators/router.validator.ts
// Presentation Validator: Zod Schemas for Router Operations
// ============================================================================

import { z } from 'zod';

export const testRouterConnectionSchema = z.object({
  host: z.string().trim().min(1, 'Host cannot be empty'),
  port: z.number().int().min(1, 'Port must be >= 1').max(65535, 'Port must be <= 65535'),
  username: z.string().trim().min(1, 'Username cannot be empty'),
  password: z.string().min(1, 'Password cannot be empty'),
  connectionMethod: z
    .enum(['ROUTEROS_API_SSL', 'ROUTEROS_API_PLAIN', 'REST_API_HTTPS', 'REST_API_PLAIN', 'SSH_TUNNEL'])
    .optional(),
  caCertificate: z.string().optional(),
  certificateFingerprint: z.string().optional(),
  tlsRejectUnauthorized: z.boolean().optional(),
});

export type TestRouterConnectionBody = z.infer<typeof testRouterConnectionSchema>;

export const createRouterSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  host: z.string().trim().min(1, 'Host is required'),
  port: z.number().int().min(1, 'Port must be >= 1').max(65535, 'Port must be <= 65535'),
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  connectionMethod: z
    .enum(['ROUTEROS_API_SSL', 'ROUTEROS_API_PLAIN', 'REST_API_HTTPS', 'REST_API_PLAIN', 'SSH_TUNNEL'])
    .optional(),
  certificateFingerprint: z.string().optional(),
  backupEnabled: z.boolean().optional(),
  status: z.enum(['ONLINE', 'OFFLINE', 'UNREACHABLE', 'CONNECTING', 'ERROR', 'MAINTENANCE']).optional(),
  routerOsVersion: z.string().trim().optional(),
  boardModel: z.string().trim().optional(),
  cpuLoadPercentage: z.number().int().min(0).max(100).optional(),
  uptimeSeconds: z.number().int().min(0).optional(),
});

export type CreateRouterBody = z.infer<typeof createRouterSchema>;

export const updateRouterSchema = z.object({
  name: z.string().trim().min(1).optional(),
  host: z.string().trim().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().trim().min(1).optional(),
  password: z.string().min(1).optional(),
  connectionMethod: z
    .enum(['ROUTEROS_API_SSL', 'ROUTEROS_API_PLAIN', 'REST_API_HTTPS', 'REST_API_PLAIN', 'SSH_TUNNEL'])
    .optional(),
  certificateFingerprint: z.string().optional(),
  backupEnabled: z.boolean().optional(),
  status: z.enum(['ONLINE', 'OFFLINE', 'UNREACHABLE', 'CONNECTING', 'ERROR', 'MAINTENANCE']).optional(),
  routerOsVersion: z.string().trim().optional(),
  boardModel: z.string().trim().optional(),
  cpuLoadPercentage: z.number().int().min(0).max(100).optional(),
  uptimeSeconds: z.number().int().min(0).optional(),
  lastErrorMessage: z.string().nullable().optional(),
});

export type UpdateRouterBody = z.infer<typeof updateRouterSchema>;

export const routerIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'Router ID is required'),
});

export type RouterIdParams = z.infer<typeof routerIdParamsSchema>;

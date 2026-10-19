// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/validators/admin.validator.ts
// Request Validation: Admin & License Code Payloads (Rule 19, Rule 26, Rule 27)
// ============================================================================

import { z } from 'zod';

export const generateLicenseCodeSchema = z.object({
  planName: z
    .string()
    .trim()
    .min(2, 'اسم الخطة يجب أن يكون حرفين على الأقل')
    .max(50, 'اسم الخطة طويل جداً'),
  durationDays: z
    .number()
    .int('المدة يجب أن تكون عدداً صحيحاً بالأيام')
    .positive('المدة يجب أن تكون يوماً واحداً على الأقل')
    .max(3650, 'المدة لا يمكن أن تتجاوز 10 سنوات'),
  maxRoutersLimit: z
    .number()
    .int('حد الراوترات يجب أن يكون عدداً صحيحاً')
    .positive('حد الراوترات يجب أن يكون راوتر واحد على الأقل')
    .max(1000, 'الحد الأقصى للراوترات هو 1000'),
});

export type GenerateLicenseCodeInputDto = z.infer<typeof generateLicenseCodeSchema>;

export const redeemLicenseCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(5, 'كود الترخيص غير صالح')
    .max(50, 'كود الترخيص طويل جداً'),
});

export type RedeemLicenseCodeInputDto = z.infer<typeof redeemLicenseCodeSchema>;

export const adminActivateTenantSchema = z.object({
  planName: z
    .string()
    .trim()
    .min(2, 'اسم الخطة يجب أن يكون حرفين على الأقل')
    .max(50, 'اسم الخطة طويل جداً'),
  durationDays: z
    .number()
    .int('المدة يجب أن تكون عدداً صحيحاً بالأيام')
    .positive('المدة يجب أن تكون يوماً واحداً على الأقل')
    .max(3650, 'المدة لا يمكن أن تتجاوز 10 سنوات'),
  maxRoutersLimit: z
    .number()
    .int('حد الراوترات يجب أن يكون عدداً صحيحاً')
    .positive('حد الراوترات يجب أن يكون راوتر واحد على الأقل')
    .max(1000, 'الحد الأقصى للراوترات هو 1000'),
});

export type AdminActivateTenantInputDto = z.infer<typeof adminActivateTenantSchema>;

export const updateUserRoleSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'TENANT_ADMIN', 'OPERATOR', 'RESELLER', 'ACCOUNTANT'] as const, {
    message: 'الدور المطلوب غير صالح. الأدوار المتاحة: SUPER_ADMIN, TENANT_ADMIN, OPERATOR, RESELLER, ACCOUNTANT',
  }),
});

export type UpdateUserRoleInputDto = z.infer<typeof updateUserRoleSchema>;

export const createSuperAdminSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'الاسم الكامل يجب أن يتكون من حرفين على الأقل')
    .max(100, 'الاسم الكامل طويل جداً'),
  username: z
    .string()
    .trim()
    .min(3, 'اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل')
    .max(50, 'اسم المستخدم طويل جداً'),
  email: z.string().trim().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف'),
});

export type CreateSuperAdminInputDto = z.infer<typeof createSuperAdminSchema>;


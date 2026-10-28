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

export const createSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(2, 'اسم الباقة مطلوب').max(100),
  durationDays: z.number().int().positive('المدة يجب أن تكون يوماً واحداً على الأقل'),
  price: z.number().positive('السعر يجب أن يكون أكبر من صفر'),
  currency: z.string().trim().min(1).default('SDG'),
  description: z.string().trim().optional(),
  maxRoutersLimit: z.number().int().positive().default(5),
  isActive: z.boolean().default(true),
});

export type CreateSubscriptionPlanInputDto = z.infer<typeof createSubscriptionPlanSchema>;

export const updateSubscriptionPlanSchema = createSubscriptionPlanSchema.partial();

export type UpdateSubscriptionPlanInputDto = z.infer<typeof updateSubscriptionPlanSchema>;

export const requestActivationSchema = z.object({
  planId: z.string().trim().min(1, 'معرف الباقة مطلوب'),
  paymentMethodId: z.string().trim().optional(),
  senderName: z.string().trim().max(100, 'اسم صاحب التحويل يجب ألا يتجاوز 100 حرف').optional(),
  referenceNumber: z.string().trim().max(100, 'رقم العملية المرجعي يجب ألا يتجاوز 100 حرف').optional(),
  receiptImageBase64: z.string().optional(),
  notes: z.string().trim().max(500, 'الملاحظات يجب ألا تتجاوز 500 حرف').optional(),
});

export type RequestActivationInputDto = z.infer<typeof requestActivationSchema>;

export const reviewSubscriptionRequestSchema = z.object({
  reviewNotes: z.string().trim().max(500, 'ملاحظات المراجعة يجب ألا تتجاوز 500 حرف').optional(),
});

export type ReviewSubscriptionRequestInputDto = z.infer<typeof reviewSubscriptionRequestSchema>;

export const createPaymentMethodSchema = z.object({
  providerName: z.string().trim().min(2, 'اسم مزود الدفع مطلوب (حرفان على الأقل)').max(100),
  accountName: z.string().trim().min(2, 'اسم الحساب مطلوب').max(100),
  accountNumber: z.string().trim().min(3, 'رقم الحساب أو الآيبان مطلوب').max(100),
  beneficiaryName: z.string().trim().max(100).optional(),
  iban: z.string().trim().max(100).optional(),
  instructions: z.string().trim().max(500).optional(),
  currency: z.string().trim().max(10).optional().default('SDG'),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.number().int().optional().default(0),
});

export type CreatePaymentMethodInputDto = z.infer<typeof createPaymentMethodSchema>;

export const updatePaymentMethodSchema = z.object({
  providerName: z.string().trim().min(2).max(100).optional(),
  accountName: z.string().trim().min(2).max(100).optional(),
  accountNumber: z.string().trim().min(3).max(100).optional(),
  beneficiaryName: z.string().trim().max(100).optional().nullable(),
  iban: z.string().trim().max(100).optional().nullable(),
  instructions: z.string().trim().max(500).optional().nullable(),
  currency: z.string().trim().max(10).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

export type UpdatePaymentMethodInputDto = z.infer<typeof updatePaymentMethodSchema>;

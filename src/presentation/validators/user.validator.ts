// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/validators/user.validator.ts
// Presentation Validator: Zod Schemas for User Management (Rule 14, Rule 19)
// ============================================================================

import { z } from 'zod';

export const STAFF_ROLES = [
  'TENANT_ADMIN',
  'OPERATOR',
  'RESELLER',
  'ACCOUNTANT',
] as const;

export const createStaffUserSchema = z.object({
  username: z
    .string()
    .min(3, 'اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل')
    .max(50, 'اسم المستخدم يجب ألا يتجاوز 50 حرفاً')
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام وعلامات _ . - فقط'
    ),
  password: z
    .string()
    .min(6, 'كلمة المرور يجب أن تتكون من 6 خانات على الأقل'),
  fullName: z
    .string()
    .min(2, 'الاسم الكامل يجب أن يتكون من حرفين على الأقل')
    .max(100, 'الاسم الكامل يجب ألا يتجاوز 100 حرفاً'),
  role: z.enum(STAFF_ROLES, {
    message: 'الدور المحدد غير صالح. الأدوار المتاحة: TENANT_ADMIN, OPERATOR, RESELLER, ACCOUNTANT',
  }),
  email: z.string().email('البريد الإلكتروني غير صالح').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
});

export type CreateStaffUserBody = z.infer<typeof createStaffUserSchema>;

export const deactivateUserParamsSchema = z.object({
  id: z.string().uuid('معرف المستخدم يجب أن يكون UUID صالح'),
});

export type DeactivateUserParams = z.infer<typeof deactivateUserParamsSchema>;

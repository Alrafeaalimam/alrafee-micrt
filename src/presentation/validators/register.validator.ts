// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/validators/register.validator.ts
// Request Validation: Public Tenant Self-Registration Payloads (Rule 19, Rule 32)
// ============================================================================

import { z } from 'zod';

export const registerSchema = z.object({
  networkName: z
    .string()
    .trim()
    .min(2, 'يجب أن يكون اسم الشبكة حرفين على الأقل')
    .max(100, 'اسم الشبكة طويل جداً'),
  adminFullName: z
    .string()
    .trim()
    .min(2, 'يجب أن يكون الاسم الكامل حرفين على الأقل')
    .max(100, 'الاسم الكامل طويل جداً'),
  username: z
    .string()
    .trim()
    .min(3, 'يجب أن يكون اسم المستخدم 3 أحرف على الأقل')
    .max(50, 'اسم المستخدم طويل جداً')
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      'اسم المستخدم يجب أن يحتوي على أحرف وأرقام ورموز (- _ .) فقط'
    ),
  email: z
    .string()
    .trim()
    .email('البريد الإلكتروني غير صالح')
    .toLowerCase(),
  password: z
    .string()
    .min(8, 'يجب ألا تقل كلمة المرور عن 8 أحرف'),
  phone: z
    .string()
    .trim()
    .optional(),
});

export type RegisterInputDto = z.infer<typeof registerSchema>;

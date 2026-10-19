// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System (Jalsah)
// File: src/application/use-cases/auth/RequestPasswordResetUseCase.ts
// Use Case: Request Password Reset OTP via Email (Rule 14 - Anti Enumeration, Rule 19 - Rate Limit)
// ============================================================================

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { IEmailService, defaultEmailService } from '../../../infrastructure/email/EmailService.js';

export interface RequestPasswordResetInput {
  email: string;
}

export interface RequestPasswordResetOutput {
  success: boolean;
  message: string;
}

export const GENERIC_PASSWORD_RESET_MESSAGE =
  'إذا كان هذا البريد مسجلاً في النظام، فستصلك رسالة تحتوي على كود التحقق';

export class RequestPasswordResetUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly emailService: IEmailService = defaultEmailService
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<RequestPasswordResetOutput> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Search for user by email (case-insensitive)
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });

    // 2. Anti-enumeration: If user does not exist, return generic message immediately
    if (!user || !user.email) {
      return {
        success: true,
        message: GENERIC_PASSWORD_RESET_MESSAGE,
      };
    }

    // 3. Rate limiting: Maximum 3 requests per email/user within 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentRequestsCount = await this.prisma.passwordResetOtp.count({
      where: {
        userId: user.id,
        createdAt: {
          gte: fifteenMinutesAgo,
        },
      },
    });

    if (recentRequestsCount >= 3) {
      // Silently reject by returning the exact same generic message
      return {
        success: true,
        message: GENERIC_PASSWORD_RESET_MESSAGE,
      };
    }

    // 4. Generate random secure 6-digit OTP
    const otpCode = crypto.randomInt(100000, 1000000).toString();

    // 5. Hash OTP before saving (never store plain OTP in database)
    const otpHash = await bcrypt.hash(otpCode, 10);

    // 6. Set expiration time: Now + 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // 7. Store OTP record in database
    await this.prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt,
        used: false,
      },
    });

    // 8. Dispatch email via EmailService
    try {
      await this.emailService.sendOtpEmail(user.email, otpCode);
    } catch (emailErr) {
      console.error('[RequestPasswordResetUseCase] Error sending OTP email:', emailErr);
      // We still return generic success to avoid leaking internal email delivery status
    }

    return {
      success: true,
      message: GENERIC_PASSWORD_RESET_MESSAGE,
    };
  }
}

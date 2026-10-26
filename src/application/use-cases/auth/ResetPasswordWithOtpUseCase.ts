// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System (Jalsah)
// File: src/application/use-cases/auth/ResetPasswordWithOtpUseCase.ts
// Use Case: Verify OTP and Reset User Password (Rule 14 - Security, Rule 26 - Audit)
// ============================================================================

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { hashPassword } from '../../../infrastructure/security/password.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { InvalidOtpException } from '../../../domain/exceptions/OtpExceptions.js';

export interface ResetPasswordWithOtpInput {
  email: string;
  otpCode: string;
  newPassword: string;
}

export interface ResetPasswordWithOtpOutput {
  success: boolean;
  message: string;
}

export class ResetPasswordWithOtpUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: ResetPasswordWithOtpInput): Promise<ResetPasswordWithOtpOutput> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const cleanOtp = input.otpCode.trim();

    // 1. Locate user by email
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });

    if (!user) {
      throw new InvalidOtpException('كود التحقق غير صحيح أو انتهت صلاحيته');
    }

    // 2. Fetch unused and unexpired OTP records for this user
    const now = new Date();
    const candidateOtps = await this.prisma.passwordResetOtp.findMany({
      where: {
        userId: user.id,
        used: false,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (candidateOtps.length === 0) {
      throw new InvalidOtpException('كود التحقق غير صحيح أو انتهت صلاحيته');
    }

    // 3. Verify OTP against stored hash
    let matchingOtp: typeof candidateOtps[0] | null = null;
    for (const candidate of candidateOtps) {
      const isMatch = await bcrypt.compare(cleanOtp, candidate.otpHash);
      if (isMatch) {
        matchingOtp = candidate;
        break;
      }
    }

    if (!matchingOtp) {
      throw new InvalidOtpException('كود التحقق غير صحيح أو انتهت صلاحيته');
    }

    // 4. Hash new password
    const newPasswordHash = await hashPassword(input.newPassword);

    // 5. Atomic execution: update password, mark matching OTP used, and invalidate remaining OTPs
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.passwordResetOtp.update({
        where: { id: matchingOtp.id },
        data: { used: true },
      }),
      this.prisma.passwordResetOtp.updateMany({
        where: {
          userId: user.id,
          used: false,
        },
        data: { used: true },
      }),
    ]);

    // 6. Security Audit Log (Rule 26)
    if (this.auditLogger) {
      await this.auditLogger.log(
        user.tenantId,
        user.id,
        'UPDATE',
        'User',
        user.id,
        'Password reset via OTP',
        'SUCCESS'
      );
    }

    return {
      success: true,
      message: 'تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
    };
  }
}

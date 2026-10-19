// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System (Jalsah)
// File: src/application/use-cases/auth/VerifyDeviceOtpUseCase.ts
// Use Case: Verify Device OTP, Trust Device, and Issue Full JWT Token (Rule 14)
// ============================================================================

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';
import { signToken, verifyTempToken } from '../../../infrastructure/security/jwt.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { defaultAuditLogger } from '../../../infrastructure/logging/AuditLogger.js';
import { InvalidOtpException } from '../../../domain/exceptions/OtpExceptions.js';
import { InactiveUserException } from '../../../domain/exceptions/InactiveUserException.js';

export interface VerifyDeviceOtpInput {
  tempToken: string;
  otpCode: string;
  deviceFingerprint: string;
  deviceLabel?: string | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface VerifyDeviceOtpOutput {
  token: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    email?: string | null | undefined;
    role: string;
    tenantId: string;
    networkName?: string | undefined;
  };
}

export class VerifyDeviceOtpUseCase {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditLogger: IAuditLogger = defaultAuditLogger
  ) {}

  async execute(input: VerifyDeviceOtpInput): Promise<VerifyDeviceOtpOutput> {
    // 1. Verify temporary token structure and expiration
    let decodedPayload: { userId: string; tenantId: string };
    try {
      decodedPayload = verifyTempToken(input.tempToken);
    } catch {
      throw new InvalidOtpException('رمز التحقق المؤقت منتهي الصلاحية أو غير صالح');
    }

    const cleanOtp = input.otpCode?.trim();
    const cleanFingerprint = input.deviceFingerprint?.trim();

    if (!cleanOtp || !cleanFingerprint) {
      throw new InvalidOtpException('كود التحقق وبصمة الجهاز مطلوبان لإتمام التحقق');
    }

    // 2. Fetch user
    const user = await this.prisma.user.findUnique({
      where: { id: decodedPayload.userId },
      include: { tenant: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new InactiveUserException('المستخدم غير موجود أو غير نشط في النظام');
    }

    if (user.tenant?.isDeleted || user.tenant?.subscriptionStatus === 'SUSPENDED') {
      throw new InactiveUserException('حساب الشبكة موقوف أو محذوف');
    }

    // 3. Find candidate unexpired & unused login OTPs
    const now = new Date();
    const candidateOtps = await this.prisma.loginOtp.findMany({
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

    // 4. Verify OTP code against stored hashes
    let matchingOtp: (typeof candidateOtps)[0] | null = null;
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

    // 5. Atomic persistence: mark OTP used, register TrustedDevice, update last login
    await this.prisma.$transaction([
      this.prisma.loginOtp.update({
        where: { id: matchingOtp.id },
        data: { used: true },
      }),
      this.prisma.loginOtp.updateMany({
        where: {
          userId: user.id,
          used: false,
        },
        data: { used: true },
      }),
      this.prisma.trustedDevice.upsert({
        where: {
          userId_deviceFingerprint: {
            userId: user.id,
            deviceFingerprint: cleanFingerprint,
          },
        },
        create: {
          userId: user.id,
          deviceFingerprint: cleanFingerprint,
          deviceLabel: input.deviceLabel ?? null,
          lastUsedAt: new Date(),
        },
        update: {
          ...(input.deviceLabel ? { deviceLabel: input.deviceLabel } : {}),
          lastUsedAt: new Date(),
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          ...(input.ip ? { lastLoginIp: input.ip } : {}),
        },
      }),
    ]);

    // 6. Security Audit Log (action: LOGIN, description: "دخول من جهاز جديد تم التحقق منه")
    if (this.auditLogger) {
      await this.auditLogger.log(
        user.tenantId,
        user.id,
        'LOGIN',
        'User',
        user.id,
        'دخول من جهاز جديد تم التحقق منه',
        'SUCCESS'
      );
    }

    // 7. Issue full 24h JWT token
    const token = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        networkName: user.tenant?.name ?? user.tenantId,
      },
    };
  }
}

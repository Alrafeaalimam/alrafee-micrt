// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/notifications/MarkNotificationReadUseCase.ts
// Use Case: Mark Notification as Read for Current User
// ============================================================================

import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export interface MarkNotificationReadInput {
  notificationId: string;
  userId: string;
}

export interface MarkNotificationReadOutput {
  success: boolean;
  notificationId: string;
  isRead: boolean;
  readAt: Date;
}

export class MarkNotificationReadUseCase {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async execute(input: MarkNotificationReadInput): Promise<MarkNotificationReadOutput> {
    const { notificationId, userId } = input;

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('الإشعار غير موجود');
    }

    const readRecord = await this.prisma.notificationRead.upsert({
      where: {
        notificationId_userId: {
          notificationId,
          userId,
        },
      },
      update: {
        readAt: new Date(),
      },
      create: {
        notificationId,
        userId,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      notificationId,
      isRead: true,
      readAt: readRecord.readAt,
    };
  }
}

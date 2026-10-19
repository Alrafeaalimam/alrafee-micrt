// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/notifications/ListMyNotificationsUseCase.ts
// Use Case: List Notifications For Authenticated User (Tenant Specific + Broadcast)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export interface ListMyNotificationsInput {
  userId: string;
  tenantId: string;
}

export interface UserNotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  tenantId: string | null;
  createdAt: Date;
  isRead: boolean;
  readAt: Date | null;
}

export interface ListMyNotificationsOutput {
  notifications: UserNotificationItem[];
  unreadCount: number;
}

export class ListMyNotificationsUseCase {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async execute(input: ListMyNotificationsInput): Promise<ListMyNotificationsOutput> {
    const { userId, tenantId } = input;

    // 1. Fetch all notifications matching tenantId OR broadcast (tenantId is null)
    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [{ tenantId: tenantId }, { tenantId: null }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        reads: {
          where: { userId: userId },
          select: { readAt: true },
        },
      },
    });

    let unreadCount = 0;

    const mapped: UserNotificationItem[] = notifications.map((n) => {
      const readRecord = n.reads[0];
      const isRead = Boolean(readRecord);
      if (!isRead) {
        unreadCount += 1;
      }
      return {
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        tenantId: n.tenantId,
        createdAt: n.createdAt,
        isRead,
        readAt: readRecord?.readAt ?? null,
      };
    });

    return {
      notifications: mapped,
      unreadCount,
    };
  }
}

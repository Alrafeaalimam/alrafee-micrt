// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/notifications/GenerateTrialEndingNotificationUseCase.ts
// Use Case: Automatically Generate Trial Ending Notifications (Prevent duplication within 24h)
// ============================================================================

import { PrismaClient } from '@prisma/client/wasm.js';
import { prisma as defaultPrisma } from '../../../infrastructure/database/prisma.js';

export interface GenerateTrialEndingInput {
  tenantId: string;
  daysRemaining: number;
}

export class GenerateTrialEndingNotificationUseCase {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async execute(input: GenerateTrialEndingInput): Promise<boolean> {
    const { tenantId, daysRemaining } = input;

    if (daysRemaining > 2) {
      return false;
    }

    const title = 'اقتراب انتهاء التجربة المجانية';

    // Check if an existing SYSTEM notification with this title was created for this tenant in the last 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenantId,
        type: 'SYSTEM',
        title,
        createdAt: { gte: last24h },
      },
    });

    if (existing) {
      return false; // Already sent within 24 hours
    }

    let bodyText = '';
    if (daysRemaining <= 0) {
      bodyText = 'انتهت فترتك التجريبية المجانية اليوم. يرجى تفعيل كود ترخيص للاستمرار في استخدام الخدمة.';
    } else if (daysRemaining === 1) {
      bodyText = 'باقي يوم واحد على انتهاء تجربتك المجانية. يرجى تفعيل كود ترخيص للاستمرار في الخدمة.';
    } else {
      bodyText = 'باقي يومان على انتهاء تجربتك المجانية. يرجى تفعيل كود ترخيص للاستمرار في الخدمة.';
    }

    await this.prisma.notification.create({
      data: {
        tenantId,
        type: 'SYSTEM',
        title,
        body: bodyText,
      },
    });

    return true;
  }
}

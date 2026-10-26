// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/cards/GenerateCardBatchUseCase.ts
// Application Use Case: Generate Card Batch with Cryptographically Secure Credentials
// Master Reference: Rule 9 (Cards), Rule 10 (Packages), Rule 16 (Clean Architecture)
// ============================================================================

import crypto from 'node:crypto';
import {
  ICardBatchRepository,
  CardBatch,
} from '../../interfaces/ICardBatchRepository.js';
import {
  ICardRepository,
  Card,
  CreateCardData,
} from '../../interfaces/ICardRepository.js';
import { IPackageRepository } from '../../interfaces/IPackageRepository.js';
import { IRouterRepository } from '../../interfaces/IRouterRepository.js';
import {
  IRouterConnector,
  CreateHotspotUserOptions,
} from '../../interfaces/IRouterConnector.js';
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { CardStatus } from '../../../domain/state-machines/CardStateMachine.js';
import { TrialCardGenerationLockedException } from '../../../domain/exceptions/TrialCardGenerationLockedException.js';
import { SubscriptionGuard } from '../../../infrastructure/security/SubscriptionGuard.js';

export type CardGenerationMode = 'USERNAME_AND_PASSWORD' | 'NUMBERS_ONLY';

export interface GenerateCardBatchInput {
  tenantId: string;
  packageId: string;
  quantity: number;
  prefix?: string | undefined;
  userLength?: number | undefined;
  passwordLength?: number | undefined;
  createdById: string;
  routerId?: string | undefined;
  generationMode?: CardGenerationMode | undefined;
}

export interface GenerateCardBatchResult {
  batch: CardBatch;
  cards: Card[];
}

// Unambiguous alphanumeric characters (excluding 0, O, 1, I, L)
const USERNAME_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const NUMBERS_CHARSET = '0123456789';
const PASSWORD_CHARSET = '0123456789';

export class GenerateCardBatchUseCase {
  constructor(
    private readonly cardBatchRepository: ICardBatchRepository,
    private readonly cardRepository: ICardRepository,
    private readonly packageRepository: IPackageRepository,
    private readonly auditLogger?: IAuditLogger,
    private readonly routerRepository?: IRouterRepository,
    private readonly routerConnector?: IRouterConnector,
    private readonly subscriptionGuard?: SubscriptionGuard
  ) {}

  async execute(input: GenerateCardBatchInput): Promise<GenerateCardBatchResult> {
    if (!input.tenantId || input.tenantId.trim().length === 0) {
      throw new Error('Tenant ID cannot be empty');
    }
    if (!input.packageId || input.packageId.trim().length === 0) {
      throw new Error('Package ID cannot be empty');
    }
    if (!input.createdById || input.createdById.trim().length === 0) {
      throw new Error('CreatedBy ID cannot be empty');
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000) {
      throw new Error('Quantity must be an integer between 1 and 1000');
    }

    // 0. Enforce Trial Mode Card Generation Lock (Phase 14 Security Requirement)
    if (this.subscriptionGuard) {
      const subInfo = await this.subscriptionGuard.getTenantSubscriptionInfo(input.tenantId);
      if (subInfo.subscriptionStatus === 'TRIAL') {
        throw new TrialCardGenerationLockedException(
          'يمكنك استخدام وظائف Jalsah خلال الفترة التجريبية. لتوليد كروت الإنترنت، يرجى الاشتراك في إحدى الباقات أو طلب تفعيل حسابك من الإدارة.'
        );
      }
      if (subInfo.subscriptionStatus !== 'ACTIVE' || !subInfo.isAllowed) {
        throw new Error('Tenant subscription is expired or inactive');
      }
    }

    // 1. Verify Package exists and is active
    const pkg = await this.packageRepository.findById(input.packageId, input.tenantId);
    if (!pkg) {
      throw new Error(`Package with ID '${input.packageId}' not found for tenant`);
    }
    if (!pkg.isActive) {
      throw new Error(`Package '${pkg.name}' is inactive and cannot be used to generate cards`);
    }

    // 2. If routerId is provided, verify router exists and belongs to tenant
    let routerCreds: { username: string; password: string; connectionMethod: string; host: string; apiPort: number } | null = null;
    if (input.routerId) {
      if (!this.routerRepository) {
        throw new Error('Router repository is not configured for router-linked card generation');
      }
      const router = await this.routerRepository.findById(input.routerId, input.tenantId);
      if (!router) {
        throw new Error(`الراوتر المحدد (${input.routerId}) غير موجود أو لا تملك صلاحية الوصول إليه`);
      }
      if (typeof this.routerRepository.getDecryptedCredentials === 'function') {
        routerCreds = await this.routerRepository.getDecryptedCredentials(input.routerId, input.tenantId);
      }
      if (!routerCreds) {
        throw new Error('بيانات دخول الراوتر المشفرة غير متوفرة');
      }
    }

    const isNumbersOnly = input.generationMode === 'NUMBERS_ONLY';
    const userLength = input.userLength ?? (isNumbersOnly ? 8 : 6);
    const passwordLength = isNumbersOnly ? 0 : (input.passwordLength ?? 4);
    const prefix = input.prefix?.trim() ?? '';
    const activeCharset = isNumbersOnly ? NUMBERS_CHARSET : USERNAME_CHARSET;

    // 3. Cryptographically Secure Credential Generation
    const existingCards = await this.cardRepository.findAllByTenant(input.tenantId);
    const existingUsernames = new Set(existingCards.map((c) => c.username));
    const generatedUsernames = new Set<string>();
    const credentialPairs: Array<{ username: string; password: string }> = [];

    let attempts = 0;
    const maxAttempts = Math.max(1000, input.quantity * 100);

    while (credentialPairs.length < input.quantity) {
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error('تعذر توليد كروت فريدة كافية. يرجى زيادة طول اسم المستخدم أو تقليل الكمية.');
      }
      const randomUserPart = this.generateSecureRandomString(
        activeCharset,
        userLength
      );
      const username = prefix ? `${prefix}${randomUserPart}` : randomUserPart;

      if (!existingUsernames.has(username) && !generatedUsernames.has(username)) {
        generatedUsernames.add(username);
        const password = isNumbersOnly
          ? ''
          : this.generateSecureRandomString(
              PASSWORD_CHARSET,
              passwordLength
            );
        credentialPairs.push({ username, password });
      }
    }

    // 4. Batch Name & Pricing
    const batchNumber = `BATCH-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;
    const name = `دفعة ${pkg.name} (${input.quantity} كرت${isNumbersOnly ? ' - أرقام فقط' : ''})`;
    const unitPrice = pkg.price;
    const totalPrice = Number((unitPrice * input.quantity).toFixed(2));

    // 5. HotSpot User Provisioning on Router (via IRouterConnector)
    if (input.routerId && routerCreds && this.routerConnector) {
      let rateLimit: string | undefined = undefined;
      if (pkg.uploadSpeedLimit && pkg.downloadSpeedLimit) {
        rateLimit = `${pkg.uploadSpeedLimit.trim()}/${pkg.downloadSpeedLimit.trim()}`;
      } else if (pkg.downloadSpeedLimit) {
        rateLimit = pkg.downloadSpeedLimit.trim();
      }

      const options: CreateHotspotUserOptions = {
        comment: `Jalsah:${batchNumber}`,
        limitUptimeSeconds: pkg.durationMinutes > 0 ? pkg.durationMinutes * 60 : undefined,
        limitBytesTotal: (pkg.dataLimitBytes && BigInt(pkg.dataLimitBytes) > BigInt(0)) ? BigInt(pkg.dataLimitBytes) : undefined,
        rateLimit: rateLimit || undefined,
      };

      const credsInput = {
        host: routerCreds.host,
        port: routerCreds.apiPort,
        username: routerCreds.username,
        password: routerCreds.password,
        connectionMethod: routerCreds.connectionMethod as any,
      };

      const createdUsernames: string[] = [];

      for (const pair of credentialPairs) {
        const createRes = await this.routerConnector.createHotspotUser(
          credsInput,
          pair.username,
          pair.password,
          pkg.hotspotProfileName || 'default',
          options
        );

        if (!createRes.success) {
          // Partial failure rollback: Rollback already created users on router
          for (const rollbackUser of createdUsernames) {
            try {
              await this.routerConnector.disableHotspotUser(credsInput, rollbackUser);
            } catch (_) {}
          }

          throw new Error(
            `فشل إنشاء بطاقات الهوتسبوت على الراوتر: ${createRes.errorMessage || createRes.errorCode}`
          );
        }

        createdUsernames.push(pair.username);
      }
    }

    // 6. Create CardBatch record in PostgreSQL
    const batch = await this.cardBatchRepository.create({
      tenantId: input.tenantId,
      packageId: pkg.id,
      createdById: input.createdById,
      batchNumber,
      name,
      quantity: input.quantity,
      prefix: prefix || null,
      userLength,
      passwordLength,
      unitPrice,
      totalPrice,
    });

    // 7. Create Card records in initial GENERATED status linked to routerId
    const cardsToCreate: CreateCardData[] = credentialPairs.map((pair) => ({
      tenantId: input.tenantId,
      batchId: batch.id,
      packageId: pkg.id,
      routerId: input.routerId || null,
      username: pair.username,
      password: pair.password,
      status: 'GENERATED' as CardStatus,
      price: unitPrice,
    }));

    const cards = await this.cardRepository.createMany(cardsToCreate);

    // 8. Security Audit Log
    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.createdById,
        'GENERATE_BATCH',
        'CardBatch',
        batch.id,
        `Generated batch "${batch.name}" with ${input.quantity} cards for package "${pkg.name}"${input.routerId ? ` on router ${input.routerId}` : ''}`,
        'SUCCESS'
      );
    }

    return {
      batch,
      cards,
    };
  }

  /**
   * Generates a cryptographically secure random string using Node.js crypto.randomInt
   */
  private generateSecureRandomString(charset: string, length: number): string {
    let result = '';
    const charsetLength = charset.length;
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charsetLength);
      result += charset[randomIndex];
    }
    return result;
  }
}

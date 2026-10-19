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
import { IAuditLogger } from '../../interfaces/IAuditLogger.js';
import { CardStatus } from '../../../domain/state-machines/CardStateMachine.js';

export interface GenerateCardBatchInput {
  tenantId: string;
  packageId: string;
  quantity: number;
  prefix?: string | undefined;
  userLength?: number | undefined;
  passwordLength?: number | undefined;
  createdById: string;
}

export interface GenerateCardBatchResult {
  batch: CardBatch;
  cards: Card[];
}

// Unambiguous alphanumeric characters (excluding 0, O, 1, I, L)
const USERNAME_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PASSWORD_CHARSET = '0123456789';

export class GenerateCardBatchUseCase {
  constructor(
    private readonly cardBatchRepository: ICardBatchRepository,
    private readonly cardRepository: ICardRepository,
    private readonly packageRepository: IPackageRepository,
    private readonly auditLogger?: IAuditLogger
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

    // 1. Verify Package exists and is active
    const pkg = await this.packageRepository.findById(input.packageId, input.tenantId);
    if (!pkg) {
      throw new Error(`Package with ID '${input.packageId}' not found for tenant`);
    }
    if (!pkg.isActive) {
      throw new Error(`Package '${pkg.name}' is inactive and cannot be used to generate cards`);
    }

    const userLength = input.userLength ?? 6;
    const passwordLength = input.passwordLength ?? 4;
    const prefix = input.prefix?.trim() ?? '';

    // 2. Cryptographically Secure Credential Generation
    const existingCards = await this.cardRepository.findAllByTenant(input.tenantId);
    const existingUsernames = new Set(existingCards.map((c) => c.username));
    const generatedUsernames = new Set<string>();
    const credentialPairs: Array<{ username: string; password: string }> = [];

    while (credentialPairs.length < input.quantity) {
      const randomUserPart = this.generateSecureRandomString(
        USERNAME_CHARSET,
        userLength
      );
      const username = prefix ? `${prefix}${randomUserPart}` : randomUserPart;

      if (!existingUsernames.has(username) && !generatedUsernames.has(username)) {
        generatedUsernames.add(username);
        const password = this.generateSecureRandomString(
          PASSWORD_CHARSET,
          passwordLength
        );
        credentialPairs.push({ username, password });
      }
    }

    // 3. Create CardBatch record
    const batchNumber = `BATCH-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;
    const name = `دفعة ${pkg.name} (${input.quantity} كرت)`;
    const unitPrice = pkg.price;
    const totalPrice = Number((unitPrice * input.quantity).toFixed(2));

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

    // 4. Create Card records in initial GENERATED status
    const cardsToCreate: CreateCardData[] = credentialPairs.map((pair) => ({
      tenantId: input.tenantId,
      batchId: batch.id,
      packageId: pkg.id,
      username: pair.username,
      password: pair.password,
      status: 'GENERATED' as CardStatus,
      price: unitPrice,
    }));

    const cards = await this.cardRepository.createMany(cardsToCreate);

    // 5. Security Audit Log
    if (this.auditLogger) {
      await this.auditLogger.log(
        input.tenantId,
        input.createdById,
        'GENERATE_BATCH',
        'CardBatch',
        batch.id,
        `Generated batch "${batch.name}" with ${input.quantity} cards for package "${pkg.name}"`,
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

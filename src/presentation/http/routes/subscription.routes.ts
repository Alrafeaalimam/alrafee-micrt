// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/subscription.routes.ts
// Presentation Route: Subscription Status & Licensing Diagnostics (Rule 19, Rule 27)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { subscriptionGuard } from '../../../infrastructure/security/SubscriptionGuard.js';
import { redeemLicenseCodeSchema, requestActivationSchema } from '../../validators/admin.validator.js';
import { RedeemLicenseCodeUseCase } from '../../../application/use-cases/admin/RedeemLicenseCodeUseCase.js';
import { prisma } from '../../../infrastructure/database/prisma.js';
import {
  LicenseCodeNotFoundException,
  LicenseCodeAlreadyUsedException,
  LicenseCodeRevokedException,
} from '../../../domain/exceptions/LicenseExceptions.js';

export const subscriptionRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Requires authentication to know tenantId, but does NOT block expired subscriptions
  fastify.addHook('preHandler', authMiddleware);

  const redeemLicenseCodeUseCase = new RedeemLicenseCodeUseCase();

  // Storage for manual payment receipts
  const RECEIPTS_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads/receipts');
  try {
    if (!fs.existsSync(RECEIPTS_UPLOAD_DIR)) {
      fs.mkdirSync(RECEIPTS_UPLOAD_DIR, { recursive: true });
    }
  } catch (_) {}

  const saveBase64Receipt = (tenantId: string, base64Input: string): { receiptUrl: string } => {
    let rawBase64 = base64Input.trim();
    let ext = 'jpg';
    const dataUriMatch = rawBase64.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/s);
    if (dataUriMatch && dataUriMatch[1] && dataUriMatch[2]) {
      const rawType = dataUriMatch[1].toLowerCase();
      if (rawType.includes('png')) ext = 'png';
      else if (rawType.includes('webp')) ext = 'webp';
      else ext = 'jpg';
      rawBase64 = dataUriMatch[2].trim();
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0) {
      throw new Error('بيانات صورة الإشعار فارغة أو تالفة');
    }
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('حجم صورة الإشعار يتجاوز الحد الأقصى المسموح به (5 ميجابايت)');
    }

    try {
      const filename = `receipt_${tenantId}_${Date.now()}.${ext}`;
      const filePath = path.join(RECEIPTS_UPLOAD_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      return { receiptUrl: `/api/v1/subscription/receipt/${filename}` };
    } catch (_) {
      // If filesystem is read-only (such as Vercel serverless), fall back to sanitized data URI
      return { receiptUrl: `data:image/${ext};base64,${rawBase64}` };
    }
  };

  /**
   * GET /api/v1/subscription/plans
   * Lists all active commercial subscription plans for clients.
   */
  fastify.get('/plans', async (_request, reply) => {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { durationDays: 'asc' },
      });

      return reply.status(200).send({
        success: true,
        data: plans.map((p) => ({
          id: p.id,
          name: p.name,
          durationDays: p.durationDays,
          price: Number(p.price),
          currency: p.currency,
          description: p.description,
          maxRoutersLimit: p.maxRoutersLimit,
          isActive: p.isActive,
        })),
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch subscription plans');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'فشل جلب باقات الاشتراك',
      });
    }
  });

  /**
   * GET /api/v1/subscription/payment-methods
   * Lists active manual payment methods for subscribers.
   */
  fastify.get('/payment-methods', async (_request, reply) => {
    try {
      const methods = await prisma.manualPaymentMethod.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      });

      return reply.status(200).send({
        success: true,
        data: methods.map((m) => ({
          id: m.id,
          providerName: m.providerName,
          accountName: m.accountName,
          accountNumber: m.accountNumber,
          beneficiaryName: m.beneficiaryName,
          instructions: m.instructions,
          currency: m.currency,
          isActive: m.isActive,
        })),
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch payment methods');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'فشل جلب وسائل الدفع المتاحة',
      });
    }
  });

  /**
   * GET /api/v1/subscription/receipt/:filename
   * Securely streams payment receipt images.
   * Access restricted to Super Admin or the owning Tenant Admin.
   */
  fastify.get('/receipt/:filename', async (request: any, reply) => {
    const { filename } = request.params;
    const safeName = path.basename(filename);
    if (safeName !== filename || safeName.includes('..')) {
      return reply.status(400).send({
        success: false,
        errorCode: 'INVALID_FILENAME',
        errorMessage: 'اسم الملف غير صالح',
      });
    }

    const { user } = request;
    if (user.role !== 'SUPER_ADMIN') {
      const subReq = await prisma.subscriptionRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          receiptUrl: { contains: safeName },
        },
      });
      if (!subReq) {
        return reply.status(403).send({
          success: false,
          errorCode: 'FORBIDDEN',
          errorMessage: 'غير مصرح لك بالوصول إلى هذا الإشعار المالي',
        });
      }
    }

    const filePath = path.join(RECEIPTS_UPLOAD_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({
        success: false,
        errorCode: 'RECEIPT_NOT_FOUND',
        errorMessage: 'صورة الإشعار غير موجودة',
      });
    }

    const ext = path.extname(safeName).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';

    reply.type(contentType).header('Cache-Control', 'private, max-age=3600');
    return reply.send(fs.createReadStream(filePath));
  });

  /**
   * POST /api/v1/subscription/request-activation
   * Submits a new activation request for the tenant with payment proof.
   */
  fastify.post('/request-activation', async (request, reply) => {
    const parseResult = requestActivationSchema.safeParse(request.body);

    if (!parseResult.success) {
      const details = parseResult.error.flatten().fieldErrors;
      const detailsStr = Object.entries(details)
        .map(([k, v]) => `${k}: ${v?.join(', ')}`)
        .join(' | ');
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: detailsStr ? `بيانات طلب التفعيل غير صالحة (${detailsStr})` : 'بيانات طلب التفعيل غير صالحة',
        details,
      });
    }

    try {
      const { tenantId, userId } = request.user!;
      const d = parseResult.data;

      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: d.planId },
      });

      if (!plan || !plan.isActive) {
        return reply.status(404).send({
          success: false,
          errorCode: 'PLAN_NOT_FOUND',
          errorMessage: 'باقة الاشتراك المحددة غير موجودة أو غير نشطة',
        });
      }

      // Check payment method validity if specified
      if (d.paymentMethodId) {
        const pm = await prisma.manualPaymentMethod.findUnique({
          where: { id: d.paymentMethodId },
        });
        if (!pm || !pm.isActive) {
          return reply.status(400).send({
            success: false,
            errorCode: 'INVALID_PAYMENT_METHOD',
            errorMessage: 'وسيلة الدفع المختارة غير متوفرة أو معطلة',
          });
        }
      }

      // Anti-fraud: prevent duplicate reference number across approved requests
      if (d.referenceNumber && d.referenceNumber.trim().length > 0) {
        const existingApproved = await prisma.subscriptionRequest.findFirst({
          where: {
            referenceNumber: d.referenceNumber.trim(),
            status: 'APPROVED',
          },
        });
        if (existingApproved) {
          return reply.status(400).send({
            success: false,
            errorCode: 'DUPLICATE_REFERENCE_NUMBER',
            errorMessage: 'رقم العملية المرجعي مستخدم مسبقاً في عملية اشتراك معتمدة',
          });
        }
      }

      // Process receipt image if uploaded
      let savedReceiptUrl: string | null = null;
      if (d.receiptImageBase64 && d.receiptImageBase64.trim().length > 0) {
        try {
          const res = saveBase64Receipt(tenantId, d.receiptImageBase64);
          savedReceiptUrl = res.receiptUrl;
        } catch (imgErr: any) {
          return reply.status(400).send({
            success: false,
            errorCode: 'INVALID_RECEIPT_IMAGE',
            errorMessage: imgErr.message || 'فشل حفظ صورة إشعار التحويل',
          });
        }
      }

      // Prevent duplicate pending requests atomically inside transaction
      const result = await prisma.$transaction(async (tx) => {
        const pendingReq = await tx.subscriptionRequest.findFirst({
          where: {
            tenantId,
            status: 'PENDING',
          },
        });

        if (pendingReq) {
          return { error: 'PENDING_REQUEST_EXISTS' as const };
        }

        const created = await tx.subscriptionRequest.create({
          data: {
            tenantId,
            userId,
            planId: plan.id,
            paymentMethodId: d.paymentMethodId || null,
            senderName: d.senderName?.trim() || null,
            referenceNumber: d.referenceNumber?.trim() || null,
            receiptUrl: savedReceiptUrl,
            status: 'PENDING',
            notes: d.notes || null,
            // Snapshot pricing strictly from database plan (never trust client)
            priceSnapshot: plan.price,
            currencySnapshot: plan.currency,
            durationDaysSnapshot: plan.durationDays,
          },
          include: {
            plan: true,
            paymentMethod: true,
          },
        });

        return { request: created };
      });

      if ('error' in result && result.error === 'PENDING_REQUEST_EXISTS') {
        return reply.status(409).send({
          success: false,
          errorCode: 'PENDING_REQUEST_EXISTS',
          errorMessage: 'يوجد طلب تفعيل قيد المراجعة بالفعل لهذا الحساب',
        });
      }

      const newRequest = result.request!;

      return reply.status(201).send({
        success: true,
        data: {
          id: newRequest.id,
          status: newRequest.status,
          planName: newRequest.plan.name,
          price: Number(newRequest.priceSnapshot),
          currency: newRequest.currencySnapshot,
          durationDays: newRequest.durationDaysSnapshot,
          senderName: newRequest.senderName,
          referenceNumber: newRequest.referenceNumber,
          receiptUrl: newRequest.receiptUrl,
          paymentMethod: newRequest.paymentMethod?.providerName ?? null,
          notes: newRequest.notes,
          createdAt: newRequest.createdAt.toISOString(),
        },
        message: 'تم إرسال طلب التفعيل بنجاح وسيتم مراجعته وتأكيده من قبل الإدارة',
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to submit activation request');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'حدث خطأ أثناء إرسال طلب التفعيل',
      });
    }
  });

  /**
   * GET /api/v1/subscription/my-requests
   * Retrieves the activation requests history for the authenticated tenant.
   */
  fastify.get('/my-requests', async (request, reply) => {
    try {
      const { tenantId } = request.user!;
      const requests = await prisma.subscriptionRequest.findMany({
        where: { tenantId },
        include: { plan: true, paymentMethod: true },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send({
        success: true,
        data: requests.map((r) => ({
          id: r.id,
          status: r.status,
          planName: r.plan.name,
          price: Number(r.priceSnapshot),
          currency: r.currencySnapshot,
          durationDays: r.durationDaysSnapshot,
          senderName: r.senderName,
          referenceNumber: r.referenceNumber,
          receiptUrl: r.receiptUrl,
          paymentMethod: r.paymentMethod?.providerName ?? null,
          notes: r.notes,
          reviewNotes: r.reviewNotes,
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch tenant activation requests');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'فشل جلب سجل طلبات التفعيل',
      });
    }
  });

  /**
   * POST /api/v1/subscription/my-requests/:id/cancel
   * Cancels a pending activation request submitted by the tenant.
   */
  fastify.post('/my-requests/:id/cancel', async (request: any, reply) => {
    try {
      const { tenantId } = request.user!;
      const { id } = request.params;

      const subRequest = await prisma.subscriptionRequest.findFirst({
        where: { id, tenantId },
        include: { plan: true },
      });

      if (!subRequest) {
        return reply.status(404).send({
          success: false,
          errorCode: 'REQUEST_NOT_FOUND',
          errorMessage: 'طلب التفعيل غير موجود أو لا ينتمي لهذا الحساب',
        });
      }

      if (subRequest.status !== 'PENDING') {
        return reply.status(400).send({
          success: false,
          errorCode: 'REQUEST_NOT_PENDING',
          errorMessage: `لا يمكن إلغاء الطلب لأنه في حالة: ${subRequest.status}`,
        });
      }

      const updated = await prisma.subscriptionRequest.update({
        where: { id: subRequest.id },
        data: {
          status: 'CANCELLED',
          reviewedAt: new Date(),
          reviewNotes: 'تم إلغاء الطلب بواسطة المستخدم',
        },
        include: { plan: true },
      });

      return reply.status(200).send({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          planName: updated.plan.name,
          reviewedAt: updated.reviewedAt?.toISOString() ?? null,
          reviewNotes: updated.reviewNotes,
        },
        message: 'تم إلغاء طلب التفعيل بنجاح',
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to cancel subscription request');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'حدث خطأ أثناء إلغاء طلب التفعيل',
      });
    }
  });

  /**
   * GET /api/v1/subscription/status
   * Returns current subscription status, trial remaining days, and usage limits.
   */
  fastify.get('/status', async (request, reply) => {
    try {
      const { tenantId } = request.user!;
      const info = await subscriptionGuard.getTenantSubscriptionInfo(tenantId);

      return reply.status(200).send({
        success: true,
        data: {
          subscriptionStatus: info.subscriptionStatus,
          trialEndsAt: info.trialEndsAt.toISOString(),
          subscriptionEndsAt: info.subscriptionEndsAt
            ? info.subscriptionEndsAt.toISOString()
            : null,
          daysRemaining: info.daysRemaining,
          planName: info.planName,
          currentRoutersCount: info.currentRoutersCount,
          maxRoutersLimit: info.maxRoutersLimit,
        },
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch subscription status');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'Failed to fetch subscription status',
      });
    }
  });

  /**
   * POST /api/v1/subscription/redeem
   * Redeems a valid unused license code for the tenant (Tenant Admin or Super Admin).
   */
  fastify.post(
    '/redeem',
    {
      preHandler: [requireRole(['TENANT_ADMIN', 'SUPER_ADMIN'])],
    },
    async (request, reply) => {
      const parseResult = redeemLicenseCodeSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: 'كود الترخيص غير صالح',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const { tenantId, userId } = request.user!;
        const result = await redeemLicenseCodeUseCase.execute({
          code: parseResult.data.code,
          tenantId,
          userId,
        });

        return reply.status(200).send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        if (err instanceof LicenseCodeNotFoundException) {
          return reply.status(404).send({
            success: false,
            errorCode: err.code,
            errorMessage: err.message,
          });
        }

        if (err instanceof LicenseCodeAlreadyUsedException) {
          return reply.status(400).send({
            success: false,
            errorCode: err.code,
            errorMessage: err.message,
          });
        }

        if (err instanceof LicenseCodeRevokedException) {
          return reply.status(400).send({
            success: false,
            errorCode: err.code,
            errorMessage: err.message,
          });
        }

        fastify.log.error(err, 'Failed to redeem license code');
        return reply.status(500).send({
          success: false,
          errorCode: 'INTERNAL_ERROR',
          errorMessage: err.message || 'فشل تفعيل كود الترخيص',
        });
      }
    }
  );
};

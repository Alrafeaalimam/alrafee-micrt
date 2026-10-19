// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/presentation/http/routes/admin.routes.ts
// Presentation Route: Super Admin Management Endpoints (Rule 14, Rule 19, Rule 26, Rule 30)
// ============================================================================

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireSuperAdmin } from '../middlewares/requireSuperAdmin.js';
import {
  generateLicenseCodeSchema,
  adminActivateTenantSchema,
  updateUserRoleSchema,
  createSuperAdminSchema,
} from '../../validators/admin.validator.js';
import { GenerateLicenseCodeUseCase } from '../../../application/use-cases/admin/GenerateLicenseCodeUseCase.js';
import { ListTenantsUseCase } from '../../../application/use-cases/admin/ListTenantsUseCase.js';
import { ListLicenseCodesUseCase } from '../../../application/use-cases/admin/ListLicenseCodesUseCase.js';
import { ApproveTenantUseCase } from '../../../application/use-cases/admin/ApproveTenantUseCase.js';
import { RejectTenantUseCase } from '../../../application/use-cases/admin/RejectTenantUseCase.js';
import { SuspendTenantUseCase } from '../../../application/use-cases/admin/SuspendTenantUseCase.js';
import { ReactivateTenantUseCase } from '../../../application/use-cases/admin/ReactivateTenantUseCase.js';
import { DeleteTenantUseCase } from '../../../application/use-cases/admin/DeleteTenantUseCase.js';
import { UpdateUserRoleUseCase } from '../../../application/use-cases/admin/UpdateUserRoleUseCase.js';
import { AdminActivateTenantUseCase } from '../../../application/use-cases/admin/AdminActivateTenantUseCase.js';
import { ListTenantUsersUseCase } from '../../../application/use-cases/admin/ListTenantUsersUseCase.js';
import { CreateSuperAdminUseCase } from '../../../application/use-cases/admin/CreateSuperAdminUseCase.js';
import { UpdatePlatformSettingsUseCase } from '../../../application/use-cases/settings/UpdatePlatformSettingsUseCase.js';
import { SendNotificationUseCase } from '../../../application/use-cases/notifications/SendNotificationUseCase.js';
import { ConflictException } from '../../../domain/exceptions/ConflictException.js';

export const adminRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // 1. Authenticate user JWT
  fastify.addHook('preHandler', authMiddleware);

  // 2. Enforce SUPER_ADMIN role strictly on all /api/v1/admin/* routes
  fastify.addHook('preHandler', requireSuperAdmin);

  const generateLicenseCodeUseCase = new GenerateLicenseCodeUseCase();
  const listTenantsUseCase = new ListTenantsUseCase();
  const listLicenseCodesUseCase = new ListLicenseCodesUseCase();
  const approveTenantUseCase = new ApproveTenantUseCase();
  const rejectTenantUseCase = new RejectTenantUseCase();
  const suspendTenantUseCase = new SuspendTenantUseCase();
  const reactivateTenantUseCase = new ReactivateTenantUseCase();
  const deleteTenantUseCase = new DeleteTenantUseCase();
  const updateUserRoleUseCase = new UpdateUserRoleUseCase();
  const adminActivateTenantUseCase = new AdminActivateTenantUseCase();
  const listTenantUsersUseCase = new ListTenantUsersUseCase();
  const createSuperAdminUseCase = new CreateSuperAdminUseCase();
  const updatePlatformSettingsUseCase = new UpdatePlatformSettingsUseCase();
  const sendNotificationUseCase = new SendNotificationUseCase();

  // --------------------------------------------------------------------------
  // 1. GET /api/v1/admin/tenants (List all non-deleted registered tenants)
  // --------------------------------------------------------------------------
  fastify.get('/tenants', async (_request, reply) => {
    try {
      const tenants = await listTenantsUseCase.execute();
      return reply.status(200).send({
        success: true,
        data: tenants,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to list tenants for super admin');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'فشل جلب قائمة الشركات والشبكات',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 2. PATCH /api/v1/admin/tenants/:id/approve (Approve pending registration)
  // --------------------------------------------------------------------------
  fastify.patch('/tenants/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user!;

    try {
      const result = await approveTenantUseCase.execute({
        tenantId: id,
        adminUserId: userId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to approve tenant');
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل الموافقة على طلب التسجيل',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 3. PATCH /api/v1/admin/tenants/:id/reject (Reject pending registration)
  // --------------------------------------------------------------------------
  fastify.patch('/tenants/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user!;

    try {
      const result = await rejectTenantUseCase.execute({
        tenantId: id,
        adminUserId: userId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to reject tenant');
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل رفض طلب التسجيل',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 4. PATCH /api/v1/admin/tenants/:id/suspend (Suspend tenant subscription)
  // --------------------------------------------------------------------------
  fastify.patch('/tenants/:id/suspend', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user!;

    try {
      const result = await suspendTenantUseCase.execute({
        tenantId: id,
        adminUserId: userId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to suspend tenant');
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل إيقاف حساب الشبكة',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 5. PATCH /api/v1/admin/tenants/:id/reactivate (Reactivate tenant subscription)
  // --------------------------------------------------------------------------
  fastify.patch('/tenants/:id/reactivate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user!;

    try {
      const result = await reactivateTenantUseCase.execute({
        tenantId: id,
        adminUserId: userId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to reactivate tenant');
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل إعادة تفعيل حساب الشبكة',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 6. PATCH /api/v1/admin/tenants/:id/delete (Soft delete tenant - Rule 30)
  // --------------------------------------------------------------------------
  fastify.patch('/tenants/:id/delete', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user!;

    try {
      const result = await deleteTenantUseCase.execute({
        tenantId: id,
        adminUserId: userId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to soft delete tenant');
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل حذف الحساب',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 7. POST /api/v1/admin/tenants/:id/activate-license (Direct License Activation)
  // --------------------------------------------------------------------------
  fastify.post('/tenants/:id/activate-license', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user!;

    const parseResult = adminActivateTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'بيانات تفعيل الترخيص غير صالحة',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await adminActivateTenantUseCase.execute({
        tenantId: id,
        planName: parseResult.data.planName,
        durationDays: parseResult.data.durationDays,
        maxRoutersLimit: parseResult.data.maxRoutersLimit,
        adminUserId: userId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to directly activate tenant license');
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل تفعيل الترخيص المباشر',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 8. GET /api/v1/admin/tenants/:id/users (List users of a tenant)
  // --------------------------------------------------------------------------
  fastify.get('/tenants/:id/users', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const users = await listTenantUsersUseCase.execute(id);
      return reply.status(200).send({
        success: true,
        data: users,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to list tenant users');
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل جلب مستخدمي الشبكة',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 9. PATCH /api/v1/admin/users/:id/role (Update user role / Promotion)
  // --------------------------------------------------------------------------
  fastify.patch('/users/:id/role', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user!;

    const parseResult = updateUserRoleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'الدور المحدد غير صالح',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await updateUserRoleUseCase.execute({
        targetUserId: id,
        newRole: parseResult.data.role,
        adminUserId: userId,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to update user role');
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل تحديث دور المستخدم',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 10. GET /api/v1/admin/license-codes (List all generated license codes)
  // --------------------------------------------------------------------------
  fastify.get('/license-codes', async (_request, reply) => {
    try {
      const codes = await listLicenseCodesUseCase.execute();
      return reply.status(200).send({
        success: true,
        data: codes,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to list license codes for super admin');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'فشل جلب قائمة أكواد الترخيص',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 11. POST /api/v1/admin/license-codes (Generate new license code)
  // --------------------------------------------------------------------------
  fastify.post('/license-codes', async (request, reply) => {
    const parseResult = generateLicenseCodeSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'بيانات كود الترخيص غير صالحة',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { userId } = request.user!;
      const createdCode = await generateLicenseCodeUseCase.execute({
        planName: parseResult.data.planName,
        durationDays: parseResult.data.durationDays,
        maxRoutersLimit: parseResult.data.maxRoutersLimit,
        createdByUserId: userId,
      });

      return reply.status(201).send({
        success: true,
        data: createdCode,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to generate license code');
      return reply.status(500).send({
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: err.message || 'فشل توليد كود الترخيص',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 12. POST /api/v1/admin/super-admins (Create new SUPER_ADMIN user)
  // --------------------------------------------------------------------------
  fastify.post('/super-admins', async (request, reply) => {
    const parseResult = createSuperAdminSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'بيانات إنشاء مدير المنصة غير صالحة',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { userId } = request.user!;
      const createdAdmin = await createSuperAdminUseCase.execute({
        fullName: parseResult.data.fullName,
        username: parseResult.data.username,
        email: parseResult.data.email,
        password: parseResult.data.password,
        adminUserId: userId,
      });

      return reply.status(201).send({
        success: true,
        data: createdAdmin,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to create platform super admin');
      if (err instanceof ConflictException) {
        return reply.status(409).send({
          success: false,
          errorCode: err.errorCode || 'CONFLICT',
          errorMessage: err.message,
        });
      }
      return reply.status(400).send({
        success: false,
        errorCode: 'OPERATION_FAILED',
        errorMessage: err.message || 'فشل إنشاء مدير المنصة',
      });
    }
  });

  // 14. PATCH /api/v1/admin/settings (Update dynamic platform settings)
  fastify.patch('/settings', async (request: any, reply) => {
    try {
      const { userId } = request.user!;
      const body = request.body || {};
      const updated = await updatePlatformSettingsUseCase.execute({
        adminUserId: userId,
        data: body,
      });

      return reply.status(200).send({
        success: true,
        data: updated,
        message: updated.message,
      });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        errorCode: 'UPDATE_SETTINGS_FAILED',
        errorMessage: err.message || 'فشل تحديث إعدادات المنصة',
      });
    }
  });

  // 15. POST /api/v1/admin/notifications (Send manual notification or broadcast)
  fastify.post('/notifications', async (request: any, reply) => {
    try {
      const { userId } = request.user!;
      const body = request.body || {};
      const notification = await sendNotificationUseCase.execute({
        adminUserId: userId,
        title: body.title,
        body: body.body,
        tenantId: body.tenantId,
      });

      return reply.status(201).send({
        success: true,
        data: notification,
        message: notification.message,
      });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        errorCode: 'SEND_NOTIFICATION_FAILED',
        errorMessage: err.message || 'فشل إرسال الإشعار',
      });
    }
  });
};


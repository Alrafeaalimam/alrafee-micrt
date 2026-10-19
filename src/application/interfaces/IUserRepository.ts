// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/interfaces/IUserRepository.ts
// Repository Contract: User Persistence Operations (Rule 16)
// ============================================================================

export type UserRoleType =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'OPERATOR'
  | 'RESELLER'
  | 'ACCOUNTANT';

export type UserStatusType = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  tenantId: string;
  username: string;
  email?: string | null;
  passwordHash: string;
  fullName: string;
  phone?: string | null;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStaffUserInput {
  id?: string;
  tenantId: string;
  username: string;
  passwordHash: string;
  fullName: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}

export interface IUserRepository {
  /**
   * Finds a user across tenants by username.
   */
  findByUsername(username: string): Promise<User | null>;

  /**
   * Finds a user across tenants by username or email identifier.
   */
  findByIdentifier(identifier: string): Promise<User | null>;

  /**
   * Finds a user by ID.
   */
  findById(id: string): Promise<User | null>;

  /**
   * Finds a user by ID and Tenant ID.
   */
  findByIdAndTenant(id: string, tenantId: string): Promise<User | null>;

  /**
   * Finds a user within a specific tenant by username.
   */
  findByTenantAndUsername(tenantId: string, username: string): Promise<User | null>;

  /**
   * Updates last login timestamp and optional IP.
   */
  updateLastLogin(id: string, ip?: string): Promise<void>;

  /**
   * Creates a new staff user for a tenant.
   */
  createStaffUser(input: CreateStaffUserInput): Promise<User>;

  /**
   * Retrieves all staff users for a tenant.
   */
  findAllByTenant(tenantId: string): Promise<User[]>;

  /**
   * Updates a user's role.
   */
  updateRole(id: string, tenantId: string, role: string): Promise<User>;

  /**
   * Deactivates a user (sets status to INACTIVE). No physical deletion.
   */
  deactivateUser(id: string, tenantId: string): Promise<User>;
}

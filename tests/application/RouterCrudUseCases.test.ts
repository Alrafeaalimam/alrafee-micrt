// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: tests/application/RouterCrudUseCases.test.ts
// Unit Tests: Router CRUD Use Cases with In-Memory Fake Repository
// Test Runner: Node.js Built-in Test Runner via tsx
// Master Reference: Rule 16 (DIP - No DB Dependency in Unit Tests)
// ============================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  IRouterRepository,
  Router,
  CreateRouterData,
  UpdateRouterData,
} from '../../src/application/interfaces/IRouterRepository.js';
import { IAuditLogger } from '../../src/application/interfaces/IAuditLogger.js';
import { CreateRouterUseCase } from '../../src/application/use-cases/routers/CreateRouterUseCase.js';
import { ListRoutersUseCase } from '../../src/application/use-cases/routers/ListRoutersUseCase.js';
import { UpdateRouterUseCase } from '../../src/application/use-cases/routers/UpdateRouterUseCase.js';
import { DeleteRouterUseCase } from '../../src/application/use-cases/routers/DeleteRouterUseCase.js';

class InMemoryAuditLogger implements IAuditLogger {
  public logs: Array<{
    tenantId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    description: string;
    result: string;
  }> = [];

  async log(
    tenantId: string,
    userId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    description: string,
    result: string = 'SUCCESS'
  ): Promise<void> {
    this.logs.push({
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      description,
      result,
    });
  }

  clear(): void {
    this.logs = [];
  }
}

class InMemoryRouterRepository implements IRouterRepository {
  public routers: Router[] = [];

  async create(data: CreateRouterData): Promise<Router> {
    const router: Router = {
      id: `router-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenantId: data.tenantId,
      name: data.name,
      host: data.host,
      apiPort: data.apiPort ?? 8729,
      connectionMethod: data.connectionMethod ?? 'ROUTEROS_API_SSL',
      status: 'OFFLINE',
      backupEnabled: data.backupEnabled ?? true,
      metadata: data.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      credentials: {
        username: data.username,
        keyVersion: 1,
        certificateAuth: false,
        updatedAt: new Date(),
      },
    };
    this.routers.push(router);
    return router;
  }

  async findById(id: string, tenantId: string): Promise<Router | null> {
    const found = this.routers.find((r) => r.id === id && r.tenantId === tenantId);
    return found ? { ...found } : null;
  }

  async findAllByTenant(tenantId: string): Promise<Router[]> {
    return this.routers
      .filter((r) => r.tenantId === tenantId)
      .map((r) => ({ ...r }));
  }

  async update(id: string, tenantId: string, data: UpdateRouterData): Promise<Router> {
    const index = this.routers.findIndex((r) => r.id === id && r.tenantId === tenantId);
    if (index === -1) {
      throw new Error(`Router with id ${id} not found for tenant ${tenantId}`);
    }

    const current = this.routers[index]!;
    const updated: Router = {
      ...current,
      name: data.name ?? current.name,
      host: data.host ?? current.host,
      apiPort: data.apiPort ?? current.apiPort,
      connectionMethod: data.connectionMethod ?? current.connectionMethod,
      status: data.status ?? current.status,
      backupEnabled: data.backupEnabled ?? current.backupEnabled,
      metadata: data.metadata !== undefined ? data.metadata : current.metadata,
      updatedAt: new Date(),
      credentials: data.username
        ? {
            ...current.credentials!,
            username: data.username,
            updatedAt: new Date(),
          }
        : current.credentials,
    };

    this.routers[index] = updated;
    return updated;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const index = this.routers.findIndex((r) => r.id === id && r.tenantId === tenantId);
    if (index === -1) {
      throw new Error(`Router with id ${id} not found for tenant ${tenantId}`);
    }
    this.routers.splice(index, 1);
  }
}

describe('Router CRUD Use Cases Unit Tests (In-Memory Fake Repository)', () => {
  const tenantA = 'tenant-uuid-1111';
  const tenantB = 'tenant-uuid-2222';

  let repository: InMemoryRouterRepository;
  let auditLogger: InMemoryAuditLogger;
  let createUseCase: CreateRouterUseCase;
  let listUseCase: ListRoutersUseCase;
  let updateUseCase: UpdateRouterUseCase;
  let deleteUseCase: DeleteRouterUseCase;

  beforeEach(() => {
    repository = new InMemoryRouterRepository();
    auditLogger = new InMemoryAuditLogger();
    createUseCase = new CreateRouterUseCase(repository, auditLogger);
    listUseCase = new ListRoutersUseCase(repository);
    updateUseCase = new UpdateRouterUseCase(repository, auditLogger);
    deleteUseCase = new DeleteRouterUseCase(repository, auditLogger);
  });

  describe('1. CreateRouterUseCase', () => {
    it('should successfully create a new router with valid data', async () => {
      const router = await createUseCase.execute({
        tenantId: tenantA,
        name: 'Main Hall Router',
        host: '192.168.10.1',
        apiPort: 8728,
        username: 'admin',
        password: 'secretPassword123',
      });

      assert.ok(router.id);
      assert.equal(router.name, 'Main Hall Router');
      assert.equal(router.host, '192.168.10.1');
      assert.equal(router.apiPort, 8728);
      assert.equal(router.tenantId, tenantA);
      assert.equal(router.credentials?.username, 'admin');
      assert.equal(repository.routers.length, 1);
    });

    it('should reject creation when name is empty', async () => {
      await assert.rejects(
        () =>
          createUseCase.execute({
            tenantId: tenantA,
            name: '   ',
            host: '192.168.10.1',
            username: 'admin',
            password: 'secretPassword123',
          }),
        /Router name cannot be empty/
      );
    });

    it('should reject creation when host is empty', async () => {
      await assert.rejects(
        () =>
          createUseCase.execute({
            tenantId: tenantA,
            name: 'Tower Router',
            host: '',
            username: 'admin',
            password: 'secretPassword123',
          }),
        /Router host cannot be empty/
      );
    });

    it('should reject creation when username is empty', async () => {
      await assert.rejects(
        () =>
          createUseCase.execute({
            tenantId: tenantA,
            name: 'Tower Router',
            host: '192.168.20.1',
            username: '',
            password: 'secretPassword123',
          }),
        /Router username cannot be empty/
      );
    });

    it('should reject creation when password is empty', async () => {
      await assert.rejects(
        () =>
          createUseCase.execute({
            tenantId: tenantA,
            name: 'Tower Router',
            host: '192.168.20.1',
            username: 'admin',
            password: '',
          }),
        /Router password cannot be empty/
      );
    });

    it('should create an audit log on successful router creation', async () => {
      const router = await createUseCase.execute({
        tenantId: tenantA,
        name: 'Audit Create Test Router',
        host: '192.168.10.99',
        username: 'admin',
        password: 'password123',
      });

      assert.equal(auditLogger.logs.length, 1);
      assert.equal(auditLogger.logs[0]?.action, 'CREATE');
      assert.equal(auditLogger.logs[0]?.entityType, 'Router');
      assert.equal(auditLogger.logs[0]?.entityId, router.id);
      assert.equal(auditLogger.logs[0]?.tenantId, tenantA);
      assert.equal(auditLogger.logs[0]?.result, 'SUCCESS');
    });
  });

  describe('2. ListRoutersUseCase', () => {
    it('should return empty array when tenant has no registered routers', async () => {
      const routers = await listUseCase.execute({ tenantId: tenantA });
      assert.deepEqual(routers, []);
    });

    it('should list all routers belonging to specific tenant and respect tenant boundary', async () => {
      await createUseCase.execute({
        tenantId: tenantA,
        name: 'Router A1',
        host: '10.0.1.1',
        username: 'admin',
        password: 'pass',
      });
      await createUseCase.execute({
        tenantId: tenantA,
        name: 'Router A2',
        host: '10.0.1.2',
        username: 'admin',
        password: 'pass',
      });
      await createUseCase.execute({
        tenantId: tenantB,
        name: 'Router B1',
        host: '10.0.2.1',
        username: 'admin',
        password: 'pass',
      });

      const routersA = await listUseCase.execute({ tenantId: tenantA });
      const routersB = await listUseCase.execute({ tenantId: tenantB });

      assert.equal(routersA.length, 2);
      assert.equal(routersB.length, 1);
      assert.equal(routersA[0]?.name, 'Router A1');
      assert.equal(routersA[1]?.name, 'Router A2');
      assert.equal(routersB[0]?.name, 'Router B1');
    });
  });

  describe('3. UpdateRouterUseCase', () => {
    it('should successfully update router properties and credentials', async () => {
      const router = await createUseCase.execute({
        tenantId: tenantA,
        name: 'Old Router Name',
        host: '192.168.1.1',
        apiPort: 8728,
        username: 'oldAdmin',
        password: 'oldPassword',
      });

      const updated = await updateUseCase.execute({
        id: router.id,
        tenantId: tenantA,
        name: 'New RB4011 Router',
        host: '192.168.1.254',
        apiPort: 8729,
        username: 'newAdmin',
      });

      assert.equal(updated.id, router.id);
      assert.equal(updated.name, 'New RB4011 Router');
      assert.equal(updated.host, '192.168.1.254');
      assert.equal(updated.apiPort, 8729);
      assert.equal(updated.credentials?.username, 'newAdmin');
    });

    it('should throw error when updating a non-existent router ID', async () => {
      await assert.rejects(
        () =>
          updateUseCase.execute({
            id: 'non-existent-id',
            tenantId: tenantA,
            name: 'Updated Name',
          }),
        /not found/
      );
    });

    it('should throw error when updating router of another tenant', async () => {
      const router = await createUseCase.execute({
        tenantId: tenantA,
        name: 'Tenant A Router',
        host: '10.0.0.1',
        username: 'admin',
        password: 'pass',
      });

      await assert.rejects(
        () =>
          updateUseCase.execute({
            id: router.id,
            tenantId: tenantB,
            name: 'Hijacked Router',
          }),
        /not found/
      );
    });

    it('should create an audit log on successful router update', async () => {
      const router = await createUseCase.execute({
        tenantId: tenantA,
        name: 'Pre-update Router',
        host: '192.168.10.100',
        username: 'admin',
        password: 'password123',
      });
      auditLogger.clear();

      await updateUseCase.execute({
        id: router.id,
        tenantId: tenantA,
        name: 'Post-update Router',
      });

      assert.equal(auditLogger.logs.length, 1);
      assert.equal(auditLogger.logs[0]?.action, 'UPDATE');
      assert.equal(auditLogger.logs[0]?.entityType, 'Router');
      assert.equal(auditLogger.logs[0]?.entityId, router.id);
      assert.equal(auditLogger.logs[0]?.tenantId, tenantA);
      assert.equal(auditLogger.logs[0]?.result, 'SUCCESS');
    });
  });

  describe('4. DeleteRouterUseCase', () => {
    it('should successfully delete an existing router', async () => {
      const router = await createUseCase.execute({
        tenantId: tenantA,
        name: 'Router to Delete',
        host: '10.0.0.99',
        username: 'admin',
        password: 'pass',
      });

      assert.equal(repository.routers.length, 1);

      await deleteUseCase.execute({
        id: router.id,
        tenantId: tenantA,
      });

      assert.equal(repository.routers.length, 0);
    });

    it('should throw error when deleting non-existent router', async () => {
      await assert.rejects(
        () =>
          deleteUseCase.execute({
            id: 'non-existent-id',
            tenantId: tenantA,
          }),
        /not found/
      );
    });

    it('should throw error when deleting router belonging to another tenant', async () => {
      const router = await createUseCase.execute({
        tenantId: tenantA,
        name: 'Tenant A Router',
        host: '10.0.0.1',
        username: 'admin',
        password: 'pass',
      });

      await assert.rejects(
        () =>
          deleteUseCase.execute({
            id: router.id,
            tenantId: tenantB,
          }),
        /not found/
      );

      // Verify router is still intact
      assert.equal(repository.routers.length, 1);
    });

    it('should create an audit log on successful router deletion', async () => {
      const router = await createUseCase.execute({
        tenantId: tenantA,
        name: 'Pre-delete Router',
        host: '192.168.10.101',
        username: 'admin',
        password: 'password123',
      });
      auditLogger.clear();

      await deleteUseCase.execute({
        id: router.id,
        tenantId: tenantA,
      });

      assert.equal(auditLogger.logs.length, 1);
      assert.equal(auditLogger.logs[0]?.action, 'DELETE');
      assert.equal(auditLogger.logs[0]?.entityType, 'Router');
      assert.equal(auditLogger.logs[0]?.entityId, router.id);
      assert.equal(auditLogger.logs[0]?.tenantId, tenantA);
      assert.equal(auditLogger.logs[0]?.result, 'SUCCESS');
    });
  });
});

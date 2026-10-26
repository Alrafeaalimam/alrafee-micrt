// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/interfaces/IRouterRepository.ts
// Application Interface: Router Repository Abstract Contract (Rule 16 - Ports)
// ============================================================================

export type RouterConnectionMethod =
  | 'ROUTEROS_API_SSL'
  | 'ROUTEROS_API_PLAIN'
  | 'REST_API_HTTPS'
  | 'REST_API_PLAIN'
  | 'SSH_TUNNEL';

export type RouterStatusType =
  | 'ONLINE'
  | 'OFFLINE'
  | 'UNREACHABLE'
  | 'CONNECTING'
  | 'ERROR'
  | 'MAINTENANCE';

export interface RouterCredentialsView {
  id?: string;
  routerId?: string;
  username: string;
  keyVersion?: number;
  certificateAuth?: boolean;
  updatedAt?: Date;
}

export interface Router {
  id: string;
  tenantId: string;
  name: string;
  host: string;
  apiPort: number;
  connectionMethod: RouterConnectionMethod;
  status: RouterStatusType;
  routerOsVersion?: string | null;
  boardModel?: string | null;
  serialNumber?: string | null;
  cpuLoadPercentage?: number | null;
  freeMemoryBytes?: bigint | number | null;
  totalMemoryBytes?: bigint | number | null;
  uptimeSeconds?: bigint | number | null;
  lastSeenAt?: Date | null;
  lastHealthCheckAt?: Date | null;
  lastErrorMessage?: string | null;
  backupEnabled: boolean;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  credentials?: RouterCredentialsView | null;
}

export interface CreateRouterData {
  tenantId: string;
  name: string;
  host: string;
  apiPort?: number | undefined;
  connectionMethod?: RouterConnectionMethod | undefined;
  username: string;
  password: string;
  backupEnabled?: boolean | undefined;
  metadata?: any | undefined;
}

export interface UpdateRouterData {
  name?: string | undefined;
  host?: string | undefined;
  apiPort?: number | undefined;
  connectionMethod?: RouterConnectionMethod | undefined;
  username?: string | undefined;
  password?: string | undefined;
  backupEnabled?: boolean | undefined;
  status?: RouterStatusType | undefined;
  metadata?: any | undefined;
}


export interface DecryptedRouterCredentials {
  username: string;
  password: string;
  connectionMethod: string;
  host: string;
  apiPort: number;
}

export interface IRouterRepository {
  create(data: CreateRouterData): Promise<Router>;
  findById(id: string, tenantId: string): Promise<Router | null>;
  findAllByTenant(tenantId: string): Promise<Router[]>;
  update(id: string, tenantId: string, data: UpdateRouterData): Promise<Router>;
  delete(id: string, tenantId: string): Promise<void>;
  getDecryptedCredentials?(id: string, tenantId: string): Promise<DecryptedRouterCredentials | null>;
}

// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: src/application/use-cases/routers/TestRouterConnectionUseCase.ts
// Use Case: Verify connectivity and retrieve identity from MikroTik router
// Master Reference: Rule 5 (Router Connector Abstraction), Rule 16 (Clean Architecture Layers)
// Pure Application Layer - Depends ONLY on interfaces (DIP)
// ============================================================================

import {
  IRouterConnector,
  RouterCredentialsInput,
  RouterConnectorResult,
  RouterInfo,
} from '../../interfaces/IRouterConnector.js';

export class TestRouterConnectionUseCase {
  constructor(private readonly routerConnector: IRouterConnector) {}

  /**
   * Executes connection diagnostic against the target router.
   *
   * @param creds - Router connection credentials (host, port, user, pass)
   * @param timeoutMs - Optional timeout threshold
   * @returns Explicit Result type with RouterInfo on success or error details on failure
   */
  public async execute(
    creds: RouterCredentialsInput,
    timeoutMs?: number
  ): Promise<RouterConnectorResult<RouterInfo>> {
    return this.routerConnector.testConnection(creds, timeoutMs);
  }
}

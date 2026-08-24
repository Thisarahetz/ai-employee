import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHash } from 'crypto';
import { CredentialType, Integration } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt } from '../../common/crypto/encryption.util';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { DiscoveredAction, ExecuteActionResult } from './external-action.types';

/**
 * HTTP client side of the AI Employee <-> external-system Integration API Contract:
 *
 *   GET  {integration.baseUrl}/ai/actions
 *   POST {integration.baseUrl}/ai/execute   (Idempotency-Key header on every call)
 *
 * A tenant's external system either hand-rolls these two endpoints or gets them for
 * free via `packages/integration-sdk`. This service never trusts the external system to
 * be up — network/HTTP failures from executeAction() are converted into
 * `{ success: false, message }` rather than thrown, since callers (the Action Agent)
 * need a result object to relay back to the customer/AI, not an unhandled exception.
 */
@Injectable()
export class ExternalActionService {
  private readonly logger = new Logger(ExternalActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
  ) {}

  async discoverActions(integrationId: string): Promise<DiscoveredAction[]> {
    const integration = await this.getIntegrationOrThrow(integrationId);
    const headers = await this.buildAuthHeaders(integration);

    const response = await axios.get<{ actions?: DiscoveredAction[] }>(
      this.buildUrl(integration.baseUrl, '/ai/actions'),
      { headers, timeout: 10_000 },
    );
    return response.data?.actions ?? [];
  }

  async executeAction(
    integrationId: string,
    actionName: string,
    data: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<ExecuteActionResult> {
    let integration: Integration;
    try {
      integration = await this.getIntegrationOrThrow(integrationId);
    } catch (error) {
      return { success: false, message: this.describeError(error) };
    }

    const headers = await this.buildAuthHeaders(integration);
    const key = idempotencyKey ?? this.generateIdempotencyKey(integrationId, actionName, data);

    try {
      const response = await axios.post<ExecuteActionResult>(
        this.buildUrl(integration.baseUrl, '/ai/execute'),
        { action: actionName, data },
        { headers: { ...headers, 'Idempotency-Key': key }, timeout: 15_000 },
      );
      const result = response.data ?? { success: false, message: 'Empty response from external system' };

      if (result.success) {
        // Fire-and-forget — a failure to record this event must not fail the action itself.
        this.eventService
          .emit(integration.tenantId, EVENT_TYPES.ACTION_EXECUTED, {
            integrationId: integration.id,
            action: actionName,
            data,
            result: result.data,
          })
          .catch((error) =>
            this.logger.warn(`Failed to emit ${EVENT_TYPES.ACTION_EXECUTED} event: ${this.describeError(error)}`),
          );
      }

      return result;
    } catch (error) {
      const message = this.describeError(error);
      this.logger.warn(`executeAction(${actionName}) failed for integration ${integrationId}: ${message}`);
      return { success: false, message };
    }
  }

  private async getIntegrationOrThrow(integrationId: string): Promise<Integration> {
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration) throw new Error(`Integration ${integrationId} not found`);
    if (!integration.baseUrl) throw new Error(`Integration ${integrationId} has no baseUrl configured`);
    return integration;
  }

  /**
   * Credential payload field conventions (set via IntegrationService.addCredential,
   * `POST /integrations/:id/credentials`, body `{ type, payload }`):
   *  - API_KEY:       payload = { apiKey: string }        (header name from integration.config.apiKeyHeader, default "X-API-Key")
   *  - BEARER_TOKEN:  payload = { token: string }          -> Authorization: Bearer <token>
   *  - BASIC_AUTH:    payload = { username, password }     -> Authorization: Basic <base64>
   *  - OAUTH2:        payload = { accessToken: string }    -> Authorization: Bearer <accessToken>
   */
  private async buildAuthHeaders(integration: Integration): Promise<Record<string, string>> {
    const credential = await this.prisma.integrationCredential.findFirst({
      where: { integrationId: integration.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!credential) return {};

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(decrypt(credential.encryptedPayload));
    } catch (error) {
      this.logger.warn(
        `Failed to decrypt credentials for integration ${integration.id}: ${this.describeError(error)}`,
      );
      return {};
    }

    switch (credential.type) {
      case CredentialType.API_KEY: {
        const config = (integration.config ?? {}) as Record<string, unknown>;
        const headerName = typeof config.apiKeyHeader === 'string' ? config.apiKeyHeader : 'X-API-Key';
        return { [headerName]: payload.apiKey ?? '' };
      }
      case CredentialType.BEARER_TOKEN:
        return { Authorization: `Bearer ${payload.token ?? ''}` };
      case CredentialType.BASIC_AUTH: {
        const encoded = Buffer.from(`${payload.username ?? ''}:${payload.password ?? ''}`).toString('base64');
        return { Authorization: `Basic ${encoded}` };
      }
      case CredentialType.OAUTH2:
        return { Authorization: `Bearer ${payload.accessToken ?? ''}` };
      default:
        return {};
    }
  }

  private buildUrl(baseUrl: string | null, path: string): string {
    return `${(baseUrl ?? '').replace(/\/+$/, '')}${path}`;
  }

  /** Deterministic per (integration, action, payload) key so retried calls (e.g. create_booking) are safe. */
  private generateIdempotencyKey(integrationId: string, actionName: string, data: Record<string, unknown>): string {
    return createHash('sha256')
      .update(`${integrationId}:${actionName}:${JSON.stringify(data)}`)
      .digest('hex');
  }

  private describeError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data as { message?: string } | undefined;
      return responseData?.message ?? error.response?.statusText ?? error.message;
    }
    return error instanceof Error ? error.message : String(error);
  }
}

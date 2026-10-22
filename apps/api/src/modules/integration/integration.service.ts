import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { IntegrationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encrypt } from '../../common/crypto/encryption.util';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { ExternalActionService } from '../external-action/external-action.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { CreateIntegrationCredentialDto } from './dto/create-credential.dto';

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly externalActionService: ExternalActionService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  /**
   * Creates the integration with its own inbound-webhook secret. The secret is
   * returned once here (and by rotateWebhookSecret) and stored encrypted.
   */
  async create(tenantId: string, dto: CreateIntegrationDto) {
    assertIntegrationUrl(dto.baseUrl);
    if (dto.businessId) await this.assertBusiness(tenantId, dto.businessId);
    const webhookSecret = randomBytes(32).toString('hex');
    const row = await this.prisma.integration.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        baseUrl: dto.baseUrl,
        businessId: dto.businessId,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        webhookSecretEncrypted: encrypt(webhookSecret),
      },
    });
    return { ...safeIntegration(row), webhookSecret, webhookUrlPath: `/webhooks/${row.id}`, webhookUrl: webhookUrl(row.id) };
  }

  /**
   * Owner-friendly setup: AI Employee creates the connection and its keys, so the
   * owner can hand a ready "developer kit" to whoever builds their software. The
   * keys are returned once; the Base URL is added later, when the developer is done.
   */
  async createDeveloperKit(tenantId: string, name: string) {
    const clean = String(name ?? '').trim().slice(0, 100);
    if (!clean) throw new BadRequestException('Give the connection a name, e.g. "Booking system".');
    const created = await this.create(tenantId, { name: clean, type: 'STANDARD_API', config: { apiKeyHeader: 'X-API-Key' } } as CreateIntegrationDto);
    const apiKey = await this.issueApiKey(tenantId, created.id);
    return { integration: created, apiKey, webhookUrl: created.webhookUrl, webhookSecret: created.webhookSecret };
  }

  /** New API key and webhook secret (old ones stop working at once). For a lost kit. */
  async renewDeveloperKit(tenantId: string, id: string) {
    const integration = await this.findOne(tenantId, id);
    const apiKey = await this.issueApiKey(tenantId, id);
    const { webhookSecret, webhookUrl: url } = await this.rotateWebhookSecret(tenantId, id);
    return { integration: safeIntegration(integration), apiKey, webhookUrl: url, webhookSecret };
  }

  private async issueApiKey(tenantId: string, integrationId: string): Promise<string> {
    const apiKey = `aie_${randomBytes(24).toString('base64url')}`;
    // Only the newest credential is used, so older keys stop working immediately.
    await this.prisma.integrationCredential.deleteMany({ where: { integrationId } });
    await this.addCredential(tenantId, integrationId, { type: 'API_KEY', payload: { apiKey } } as CreateIntegrationCredentialDto);
    return apiKey;
  }

  async rotateWebhookSecret(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    const webhookSecret = randomBytes(32).toString('hex');
    await this.prisma.integration.update({ where: { id }, data: { webhookSecretEncrypted: encrypt(webhookSecret) } });
    return { webhookSecret, webhookUrlPath: `/webhooks/${id}`, webhookUrl: webhookUrl(id) };
  }

  private async assertBusiness(tenantId: string, businessId: string) {
    const b = await this.prisma.business.findFirst({ where: { id: businessId, tenantId }, select: { id: true } });
    if (!b) throw new NotFoundException('Business not found');
  }

  async findAll(tenantId: string) {
    const rows = await this.prisma.integration.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map((row) => this.withHealth(tenantId, row)));
  }

  /** What the owner needs to see to know the connection works, from real activity. */
  private async withHealth<T extends { id: string; webhookSecretEncrypted?: string | null }>(tenantId: string, row: T) {
    const [actionsCount, lastEvent] = await Promise.all([
      this.prisma.integrationAction.count({ where: { tenantId, integrationId: row.id, isEnabled: true } }),
      this.prisma.event.findFirst({
        where: { tenantId, sourceService: 'webhook', payload: { path: ['integrationId'], equals: row.id } },
        orderBy: { createdAt: 'desc' },
        select: { type: true, createdAt: true },
      }),
    ]);
    return {
      ...safeIntegration(row),
      webhookUrl: webhookUrl(row.id),
      actionsCount,
      lastEventType: lastEvent?.type ?? null,
      lastEventAt: lastEvent?.createdAt ?? null,
    };
  }

  /**
   * One-click check that the connection works: reach the system and load its actions,
   * then pull its knowledge feed (optional — a system without one is still connected).
   * Never throws for a failed check; the result says what failed and how to fix it.
   */
  async testConnection(tenantId: string, integrationId: string) {
    const integration = await this.findOne(tenantId, integrationId);
    if (!integration.baseUrl) {
      return { ok: false, actions: 0, knowledge: null, message: 'Add the Base URL first.' };
    }
    let actions = 0;
    try {
      actions = (await this.discover(tenantId, integrationId)).discovered;
    } catch (error) {
      return { ok: false, actions: 0, knowledge: null, message: explainConnectionError(error, integration.baseUrl) };
    }
    let knowledge: { documents: number; locations: number } | null = null;
    let knowledgeError: string | null = null;
    try {
      const r = await this.syncKnowledge(tenantId, integrationId);
      const documents = await this.prisma.document.count({ where: { tenantId, knowledgeBaseId: r.knowledgeBaseId } });
      const locations = await this.prisma.business.count({ where: { tenantId, integrationId } });
      knowledge = { documents, locations };
    } catch (error) {
      knowledgeError = error instanceof Error ? error.message : String(error);
    }
    return {
      ok: true,
      actions,
      knowledge,
      message: knowledgeError
        ? `Connected: ${actions} action(s) available. Knowledge could not be synced: ${knowledgeError}`
        : `Connected: ${actions} action(s) available${knowledge ? `, ${knowledge.documents} knowledge document(s) and ${knowledge.locations} location(s) synced` : ''}.`,
    };
  }

  async findOne(tenantId: string, id: string) {
    const integration = await this.prisma.integration.findFirst({ where: { id, tenantId } });
    if (!integration) throw new NotFoundException(`Integration ${id} not found`);
    return integration;
  }

  /** findOne without secrets, for API responses. */
  async getForApi(tenantId: string, id: string) {
    return this.withHealth(tenantId, await this.findOne(tenantId, id));
  }

  async update(tenantId: string, id: string, dto: UpdateIntegrationDto) {
    await this.findOne(tenantId, id);
    if (dto.baseUrl !== undefined) assertIntegrationUrl(dto.baseUrl);
    if (dto.businessId) await this.assertBusiness(tenantId, dto.businessId);
    const row = await this.prisma.integration.update({
      where: { id },
      data: {
        ...dto,
        config: dto.config !== undefined ? (dto.config as Prisma.InputJsonValue) : undefined,
      },
    });
    return safeIntegration(row);
  }

  async remove(tenantId: string, id: string) {
    const integration = await this.findOne(tenantId, id);
    await this.prisma.integration.delete({ where: { id } });
    // The synced KnowledgeBase is owned by the integration — tear it down too.
    if (integration.knowledgeBaseId) {
      await this.knowledgeBaseService
        .delete(tenantId, integration.knowledgeBaseId)
        .catch(() => undefined);
    }
    return { success: true };
  }

  async addCredential(tenantId: string, integrationId: string, dto: CreateIntegrationCredentialDto) {
    await this.findOne(tenantId, integrationId);
    const encryptedPayload = encrypt(JSON.stringify(dto.payload));
    const credential = await this.prisma.integrationCredential.create({
      data: { tenantId, integrationId, type: dto.type, encryptedPayload },
    });
    // Never echo the encrypted payload back to the caller.
    const { encryptedPayload: _omit, ...safe } = credential;
    return safe;
  }

  /**
   * Calls the external system's GET /ai/actions (via ExternalActionService), upserts
   * the result into IntegrationAction, marks the integration CONNECTED, and emits
   * EVENT_TYPES.INTEGRATION_CONNECTED. On failure the integration is marked ERROR and a
   * 502 is returned to the caller (unlike executeAction, discovery failures here are a
   * user-facing "your integration setup is broken" signal, not something to swallow).
   */
  async discover(tenantId: string, integrationId: string) {
    const integration = await this.findOne(tenantId, integrationId);

    try {
      const actions = await this.externalActionService.discoverActions(integration.id);

      await Promise.all(
        actions.map((action) =>
          this.prisma.integrationAction.upsert({
            where: { integrationId_name: { integrationId: integration.id, name: action.name } },
            create: {
              tenantId,
              integrationId: integration.id,
              name: action.name,
              description: action.description,
              parameters: (action.parameters ?? {}) as Prisma.InputJsonValue,
              lastDiscoveredAt: new Date(),
            },
            update: {
              description: action.description,
              parameters: (action.parameters ?? {}) as Prisma.InputJsonValue,
              lastDiscoveredAt: new Date(),
              isEnabled: true,
            },
          }),
        ),
      );

      await this.prisma.integration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.CONNECTED },
      });

      await this.eventService.emit(tenantId, EVENT_TYPES.INTEGRATION_CONNECTED, { integrationId: integration.id });

      return { integrationId: integration.id, status: IntegrationStatus.CONNECTED, discovered: actions.length };
    } catch (error) {
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.ERROR },
      });
      throw new BadGatewayException(
        `Failed to discover actions for integration ${integrationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  listActions(tenantId: string, integrationId: string) {
    return this.prisma.integrationAction.findMany({ where: { tenantId, integrationId } });
  }

  /**
   * Pulls the external system's `GET /ai/knowledge` feed into AI Employee:
   *  - `documents` (services & pricing, hours, policies) → a dedicated KnowledgeBase for
   *    this integration, auto-created on the first sync and named "<integration>
   *    (synced)", so the Knowledge Agent can answer from it via RAG. Re-runnable:
   *    documents upsert on `externalId`, ones the feed drops are pruned.
   *  - `locations` (branches) → `Business` (Location) records, upserted on `externalId`
   *    (adopting an unlinked same-named Location on first sync). Locations dropped from
   *    the feed are left in place, never deleted.
   * Discovery failures surface as a 502.
   */
  async syncKnowledge(tenantId: string, integrationId: string) {
    const integration = await this.findOne(tenantId, integrationId);

    let feed;
    try {
      feed = await this.externalActionService.fetchKnowledge(integration.id);
    } catch (error) {
      throw new BadGatewayException(
        `Failed to sync knowledge for integration ${integrationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Reuse the integration's KB if it still exists, otherwise (re)create it.
    let knowledgeBaseId = integration.knowledgeBaseId ?? undefined;
    if (knowledgeBaseId) {
      const existing = await this.prisma.knowledgeBase.findFirst({
        where: { id: knowledgeBaseId, tenantId },
        select: { id: true },
      });
      if (!existing) knowledgeBaseId = undefined;
    }
    if (!knowledgeBaseId) {
      const kb = await this.prisma.knowledgeBase.create({
        data: {
          tenantId,
          name: `${integration.name} (synced)`,
          description: `Auto-synced from the "${integration.name}" integration. Documents here are managed by AI Employee and overwritten on each sync.`,
        },
      });
      knowledgeBaseId = kb.id;
    }

    const result = await this.knowledgeBaseService.syncIntegrationDocuments(
      tenantId,
      knowledgeBaseId,
      integration.id,
      feed.documents,
    );

    const locationResult = await this.syncLocations(tenantId, integration.id, feed.locations);

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { knowledgeBaseId, lastKnowledgeSyncAt: new Date() },
    });

    const payload = { ...result, ...locationResult };

    await this.eventService.emit(tenantId, EVENT_TYPES.INTEGRATION_KNOWLEDGE_SYNCED, {
      integrationId: integration.id,
      knowledgeBaseId,
      ...payload,
    });

    return { integrationId: integration.id, knowledgeBaseId, ...payload };
  }

  /**
   * Upserts the feed's locations into `Business` (Location) rows keyed on
   * `(integrationId, externalId)`. On the first sync, an unlinked Location with the
   * same name is adopted rather than duplicated. Never deletes.
   */
  private async syncLocations(
    tenantId: string,
    integrationId: string,
    locations: { externalId: string; name: string; timezone?: string; address?: string; phone?: string }[],
  ): Promise<{ locationsCreated: number; locationsUpdated: number }> {
    let locationsCreated = 0;
    let locationsUpdated = 0;

    // New synced locations inherit the workspace's existing business type (e.g. SALON)
    // rather than defaulting to CUSTOM.
    const sibling = await this.prisma.business.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { type: true },
    });
    const inheritedType = sibling?.type;

    for (const loc of locations) {
      const name = loc.name?.trim();
      if (!loc.externalId || !name) continue;

      let existing = await this.prisma.business.findFirst({
        where: { tenantId, integrationId, externalId: loc.externalId },
      });
      if (!existing) {
        existing = await this.prisma.business.findFirst({
          where: { tenantId, integrationId: null, name },
        });
      }

      const syncedSettings = {
        address: loc.address ?? null,
        phone: loc.phone ?? null,
        syncedFromIntegrationId: integrationId,
      };

      const defaultTimezone =
        process.env.DEFAULT_TIMEZONE || process.env.GENERIC_TIMEZONE || 'Asia/Colombo';

      if (existing) {
        await this.prisma.business.update({
          where: { id: existing.id },
          data: {
            name,
            timezone: loc.timezone || existing.timezone || defaultTimezone,
            integrationId,
            externalId: loc.externalId,
            settings: {
              ...((existing.settings as Record<string, unknown>) ?? {}),
              ...syncedSettings,
            } as Prisma.InputJsonValue,
          },
        });
        locationsUpdated++;
      } else {
        await this.prisma.business.create({
          data: {
            tenantId,
            name,
            type: inheritedType,
            timezone: loc.timezone || defaultTimezone,
            integrationId,
            externalId: loc.externalId,
            settings: syncedSettings as Prisma.InputJsonValue,
          },
        });
        locationsCreated++;
      }
    }

    return { locationsCreated, locationsUpdated };
  }

  listSyncedKnowledge(tenantId: string, integrationId: string) {
    return this.prisma.document.findMany({
      where: { tenantId, integrationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async execute(tenantId: string, integrationId: string, action: string, data: Record<string, unknown>) {
    await this.findOne(tenantId, integrationId);
    return this.externalActionService.executeAction(integrationId, action, data);
  }
}

/** Never expose stored secrets (even encrypted) in API responses. */
export function safeIntegration<T extends { webhookSecretEncrypted?: string | null }>(row: T) {
  const { webhookSecretEncrypted, ...rest } = row;
  return { ...rest, hasWebhookSecret: Boolean(webhookSecretEncrypted) };
}

/** Integration base URLs must be http(s); production requires https. Private hosts are blocked at connect time. */
export function assertIntegrationUrl(url: string | null | undefined) {
  if (url === undefined || url === null || url === '') return;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new BadRequestException('baseUrl must be a valid URL');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new BadRequestException('baseUrl must use http or https');
  if (u.username || u.password) throw new BadRequestException('Put credentials in the integration credentials, not in the URL');
  if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') throw new BadRequestException('baseUrl must use https in production');
}

/** Full public URL an external system posts its events to. */
export function webhookUrl(id: string): string {
  return `${(process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '')}/webhooks/${id}`;
}

/** Plain-words reason a connection test failed, with the likely fix. */
function explainConnectionError(error: unknown, baseUrl: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthori[sz]ed|forbidden|api.?key/i.test(raw)) return 'The system rejected the API key. Copy the key again from the other system and save it here.';
  if (/404|not found/i.test(raw)) return `Nothing answered at ${baseUrl}/ai/actions. Check the Base URL is the system's API address.`;
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timeout|ETIMEDOUT|network/i.test(raw)) return `Could not reach ${baseUrl}. Check the address and that the system is running.`;
  return raw.replace(/^Failed to discover actions for integration \S+: /, '').slice(0, 300);
}

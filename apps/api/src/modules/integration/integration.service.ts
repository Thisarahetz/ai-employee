import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
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

  create(tenantId: string, dto: CreateIntegrationDto) {
    return this.prisma.integration.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        baseUrl: dto.baseUrl,
        businessId: dto.businessId,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  findAll(tenantId: string) {
    return this.prisma.integration.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(tenantId: string, id: string) {
    const integration = await this.prisma.integration.findFirst({ where: { id, tenantId } });
    if (!integration) throw new NotFoundException(`Integration ${id} not found`);
    return integration;
  }

  async update(tenantId: string, id: string, dto: UpdateIntegrationDto) {
    await this.findOne(tenantId, id);
    return this.prisma.integration.update({
      where: { id },
      data: {
        ...dto,
        config: dto.config !== undefined ? (dto.config as Prisma.InputJsonValue) : undefined,
      },
    });
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
}

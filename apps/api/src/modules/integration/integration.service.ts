import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encrypt } from '../../common/crypto/encryption.util';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { ExternalActionService } from '../external-action/external-action.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { CreateIntegrationCredentialDto } from './dto/create-credential.dto';

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly externalActionService: ExternalActionService,
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
    await this.findOne(tenantId, id);
    await this.prisma.integration.delete({ where: { id } });
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
}

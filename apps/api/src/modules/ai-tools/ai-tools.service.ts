import { Injectable } from '@nestjs/common';
import type { AIToolDefinition } from '@ai-employee/ai-core';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Bridges IntegrationAction rows (discovered from the tenant's connected
 * external system via the Integration Layer, built by Agent 3) into
 * ai-core's provider-agnostic AIToolDefinition shape. Only ENABLED actions
 * are exposed — the Action Agent should never be offered a tool it can't
 * actually call.
 */
@Injectable()
export class AiToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async getToolsForTenant(tenantId: string): Promise<AIToolDefinition[]> {
    const actions = await this.prisma.integrationAction.findMany({
      where: { tenantId, isEnabled: true },
      select: { name: true, description: true, parameters: true },
    });

    return actions.map((action) => ({
      name: action.name,
      description: action.description,
      // `parameters` is already stored in the spec's JSON-schema-ish shape
      // (see IntegrationAction.parameters in prisma/schema.prisma).
      parameters: (action.parameters ?? {}) as Record<string, unknown>,
    }));
  }
}

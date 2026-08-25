import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentType, AiProviderName } from '@prisma/client';

export interface UpdateAgentConfigurationDto {
  provider: AiProviderName;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

@Injectable()
export class AiAgentConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getAgents(tenantId: string) {
    // Ensure all configurable agents exist for this tenant
    const configurableTypes: AgentType[] = ['ROUTER', 'SUPPORT', 'KNOWLEDGE', 'ACTION'];
    
    // We execute this concurrently or in a transaction.
    // For simplicity, we just upsert all of them.
    for (const type of configurableTypes) {
      await this.prisma.aiAgent.upsert({
        where: {
          tenantId_type: { tenantId, type }
        },
        update: {},
        create: {
          tenantId,
          type,
          name: `${type.charAt(0) + type.slice(1).toLowerCase()} Agent`,
        }
      });
    }

    return this.prisma.aiAgent.findMany({
      where: { tenantId },
      include: { configuration: true },
      orderBy: { type: 'asc' },
    });
  }

  async updateConfiguration(tenantId: string, type: AgentType, dto: UpdateAgentConfigurationDto) {
    const { systemPrompt, ...configPayload } = dto;
    
    const agent = await this.prisma.aiAgent.upsert({
      where: {
        tenantId_type: { tenantId, type }
      },
      update: {
        systemPrompt,
      },
      create: {
        tenantId,
        type,
        name: `${type.charAt(0) + type.slice(1).toLowerCase()} Agent`,
        systemPrompt,
      }
    });

    await this.prisma.aiConfiguration.upsert({
      where: {
        aiAgentId: agent.id,
      },
      update: {
        ...configPayload,
      },
      create: {
        tenantId,
        aiAgentId: agent.id,
        ...configPayload,
      }
    });

    return this.prisma.aiAgent.findUnique({
      where: { id: agent.id },
      include: { configuration: true },
    });
  }
}

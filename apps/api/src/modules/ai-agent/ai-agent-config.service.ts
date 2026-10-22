import { BadRequestException, Injectable } from '@nestjs/common';
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

  async updateConfiguration(tenantId: string, type: AgentType, raw: UpdateAgentConfigurationDto) {
    const dto = validateAgentConfig(type, raw);
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

const CONFIGURABLE: AgentType[] = ['ROUTER', 'SUPPORT', 'KNOWLEDGE', 'ACTION'];

/** Rejects out-of-range or unknown values before they reach the AI provider. */
export function validateAgentConfig(type: AgentType, dto: Partial<UpdateAgentConfigurationDto>): UpdateAgentConfigurationDto {
  if (!CONFIGURABLE.includes(type)) throw new BadRequestException(`Agent type must be one of ${CONFIGURABLE.join(', ')}`);
  const provider = String(dto?.provider ?? '').toUpperCase() as AiProviderName;
  if (!(Object.values(AiProviderName) as string[]).includes(provider)) throw new BadRequestException('provider must be OPENAI, ANTHROPIC or GEMINI');
  const model = String(dto?.model ?? '').trim();
  if (!/^[A-Za-z0-9._:\/-]{2,100}$/.test(model)) throw new BadRequestException('model must be a provider model id, e.g. gpt-4o-mini');
  const temperature = Number(dto?.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new BadRequestException('temperature must be between 0 and 2');
  const maxTokens = Number(dto?.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 16 || maxTokens > 16000) throw new BadRequestException('maxTokens must be a whole number between 16 and 16000');
  const systemPrompt = String(dto?.systemPrompt ?? '').slice(0, 8000);
  return { provider, model, temperature, maxTokens, systemPrompt };
}

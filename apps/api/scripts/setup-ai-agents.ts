import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiAgentConfigService } from '../src/modules/ai-agent/ai-agent-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AgentType, AiProviderName } from '@prisma/client';

const AGENT_DEFAULTS: Record<
  AgentType,
  {
    name: string;
    provider: AiProviderName;
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
  }
> = {
  [AgentType.ROUTER]: {
    name: 'Daniel',
    provider: AiProviderName.GEMINI,
    model: 'gemini-3.6-flash',
    temperature: 0.1,
    maxTokens: 256,
    systemPrompt: `You are Daniel, an intent classification router for customer conversations. Classify customer inquiries into support, knowledge, action, booking, customer_lookup, or human_handoff.`,
  },
  [AgentType.SUPPORT]: {
    name: 'Zoe',
    provider: AiProviderName.GEMINI,
    model: 'gemini-3.6-flash',
    temperature: 0.4,
    maxTokens: 1024,
    systemPrompt: `You are Zoe, the friendly and attentive customer support assistant for Acme Salon. Greet clients warmly, answer general questions about the salon experience, and guide them on booking or learning about our hair and beauty services. Keep your tone polite, concise, and helpful.`,
  },
  [AgentType.KNOWLEDGE]: {
    name: 'Jean',
    provider: AiProviderName.GEMINI,
    model: 'gemini-3.6-flash',
    temperature: 0.2,
    maxTokens: 1024,
    systemPrompt: `You are Jean, the knowledge specialist for Acme Salon. Answer customer questions about salon services, pricing, business hours, location, parking, and policies using the provided context. If information is not in the context, politely let the customer know and offer to connect them with our team.`,
  },
  [AgentType.ACTION]: {
    name: 'Felix',
    provider: AiProviderName.GEMINI,
    model: 'gemini-3.6-flash',
    temperature: 0.2,
    maxTokens: 1024,
    systemPrompt: `You are Felix, the action and booking coordinator for Acme Salon. Help clients check availability, schedule appointments, and coordinate salon services using available integration tools accurately and efficiently.`,
  },
  [AgentType.HUMAN]: {
    name: 'Human Agent',
    provider: AiProviderName.GEMINI,
    model: 'gemini-3.6-flash',
    temperature: 0.3,
    maxTokens: 1024,
    systemPrompt: '',
  },
};

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const configService = app.get(AiAgentConfigService);

  const tenants = await prisma.tenant.findMany();
  console.log(`Configuring AI agents for ${tenants.length} tenants...`);

  for (const tenant of tenants) {
    console.log(`Setting up tenant: ${tenant.name} (${tenant.id})`);
    const types: AgentType[] = [AgentType.ROUTER, AgentType.SUPPORT, AgentType.KNOWLEDGE, AgentType.ACTION];

    for (const type of types) {
      const def = AGENT_DEFAULTS[type];
      await configService.updateConfiguration(tenant.id, type, {
        provider: def.provider,
        model: def.model,
        temperature: def.temperature,
        maxTokens: def.maxTokens,
        systemPrompt: def.systemPrompt,
      });

      // Update name
      await prisma.aiAgent.update({
        where: { tenantId_type: { tenantId: tenant.id, type } },
        data: { name: def.name },
      });

      console.log(`  ✓ Configured ${type} Agent (${def.name}) -> ${def.provider} / ${def.model}`);
    }
  }

  console.log('AI Agents configuration complete!');
  await app.close();
}

bootstrap().catch(console.error);

import { Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';

export type RoutedAgent = 'support_agent' | 'knowledge_agent' | 'action_agent' | 'human_handoff';

export interface RouteResult {
  intent: string;
  agent: RoutedAgent;
  confidence: number;
}

const ROUTER_SYSTEM_PROMPT = `You are an intent classification router for a customer support and booking system.
Classify the customer's latest message into exactly one intent and map it to the corresponding target agent:

1. "support" -> "support_agent"
   - General greetings (e.g., "hi", "hello", "hey", "good morning", "how are you"), pleasantries, chit-chat, ambiguous messages, or general customer support requests.
   - For greetings and general inquiries, ALWAYS assign high confidence (0.85 to 1.0).

2. "knowledge" -> "knowledge_agent"
   - Questions asking about business hours, services, menu, prices, address, location, policies, or general factual information about the business.

3. "action" -> "action_agent"
   - Inquiries or commands regarding booking appointments, scheduling, checking availability, cancellations, rescheduling, or customer account lookups.
   - Note: "booking" and "customer_lookup" intents also map to "action_agent".

4. "human_handoff" -> "human_handoff"
   - ONLY when the customer explicitly asks to talk to a human, real person, agent, representative, or manager (e.g. "talk to a human", "connect me to a person", "agent please").

Respond with ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{"intent": "<support|knowledge|action|booking|customer_lookup|human_handoff>", "agent": "<support_agent|knowledge_agent|action_agent|human_handoff>", "confidence": <number between 0 and 1>}`;

/**
 * RouterAgentService — the cheapest, smallest call in the whole pipeline,
 * and the one that runs on every single inbound message. Deliberately given
 * ONLY the latest customer message: no conversation history, no knowledge
 * base, no tool definitions. Its sole job is picking which specialized agent
 * handles this turn — anything more here is wasted tokens paid on every
 * message, including ones that never need it.
 */
@Injectable()
export class RouterAgentService {
  private readonly logger = new Logger(RouterAgentService.name);

  constructor(private readonly aiProviderService: AiProviderService) {}

  async route(tenantId: string, conversationId: string, latestMessage: string): Promise<RouteResult> {
    const result = await this.aiProviderService.complete(
      tenantId,
      AgentType.ROUTER,
      [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        { role: 'user', content: latestMessage },
      ],
      { conversationId, responseFormat: 'json' },
    );

    return this.parse(result.content);
  }

  private parse(raw: string): RouteResult {
    try {
      const cleaned = raw
        .trim()
        .replace(/^```(json)?/i, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(cleaned) as Partial<RouteResult>;
      const agent = this.normalizeAgent(parsed.agent, parsed.intent);
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;

      return {
        intent: typeof parsed.intent === 'string' ? parsed.intent : 'support',
        agent,
        confidence,
      };
    } catch (err) {
      this.logger.warn(`Router JSON parse failed, falling back to support_agent: ${(err as Error).message}`);
      return { intent: 'support', agent: 'support_agent', confidence: 0.85 };
    }
  }

  private normalizeAgent(agent: unknown, intent: unknown): RoutedAgent {
    if (
      agent === 'support_agent' ||
      agent === 'knowledge_agent' ||
      agent === 'action_agent' ||
      agent === 'human_handoff'
    ) {
      return agent;
    }
    // `agent` was missing/invalid — fall back to mapping straight from intent.
    switch (intent) {
      case 'knowledge':
        return 'knowledge_agent';
      case 'action':
      case 'booking':
      case 'customer_lookup':
        return 'action_agent';
      case 'human_handoff':
        return 'human_handoff';
      default:
        return 'support_agent';
    }
  }
}

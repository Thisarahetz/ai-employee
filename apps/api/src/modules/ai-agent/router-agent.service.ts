import { Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { MessageService } from '../message/message.service';
import { TimeContextService } from './time-context.service';
import { fastPathRoute } from './fast-path-router.util';

export type RoutedAgent = 'support_agent' | 'knowledge_agent' | 'action_agent' | 'human_handoff';

export interface RouteResult {
  intent: string;
  agent: RoutedAgent;
  confidence: number;
}

const ROUTER_SYSTEM_PROMPT = `You are an intent classification router for a customer support and booking system.
Classify the customer's LATEST message into exactly one intent and map it to the corresponding target agent.
Recent conversation turns are provided before the latest message — use them only to interpret the latest message, not to reclassify earlier ones.

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

CONTINUITY RULE: If the latest message only makes sense as a continuation of what the assistant was just doing — a bare confirmation ("yes", "ok", "sure", "go ahead"), or just a piece of data the assistant asked for (a name, phone number, email address, date, or time) — classify it with the intent of that in-progress task. An in-progress booking stays "action". When a specific "previous agent" is given below, prefer routing such continuation messages back to that same agent unless the customer has clearly changed the subject.

Respond with ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{"intent": "<support|knowledge|action|booking|customer_lookup|human_handoff>", "agent": "<support_agent|knowledge_agent|action_agent|human_handoff>", "confidence": <number between 0 and 1>}`;

/** How an in-flight AgentType maps into the router's own agent vocabulary. */
const PREVIOUS_AGENT_LABEL: Partial<Record<AgentType, string>> = {
  [AgentType.SUPPORT]: 'support_agent',
  [AgentType.KNOWLEDGE]: 'knowledge_agent',
  [AgentType.ACTION]: 'action_agent',
};

/**
 * RouterAgentService — the cheapest, smallest call in the whole pipeline,
 * and the one that runs on every single inbound message. It gets the latest
 * customer message plus a handful of recent turns (needed to route
 * continuation messages like "yes" or a bare phone number to the agent that
 * was mid-task) and, when known, which agent handled the previous turn. It is
 * still deliberately denied the knowledge base and tool definitions — its
 * sole job is picking which specialized agent handles this turn.
 */
@Injectable()
export class RouterAgentService {
  private readonly logger = new Logger(RouterAgentService.name);

  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly messageService: MessageService,
    private readonly timeContextService: TimeContextService,
  ) {}

  async route(
    tenantId: string,
    conversationId: string,
    latestMessage: string,
    previousAgent?: AgentType | null,
  ): Promise<RouteResult> {
    // 1. Zero-Token Fast Path Check (MindStudio Technique 8 & Deterministic Filter)
    // Completely bypasses LLM call for greetings, handoff requests, and simple affirmations.
    const fastRoute = fastPathRoute(latestMessage, previousAgent);
    if (fastRoute) {
      this.logger.debug(
        `[Zero-Token Route] Bypassed LLM for message="${latestMessage.slice(0, 30)}..." -> ${fastRoute.agent}`,
      );
      return fastRoute;
    }

    // 2. Fallback to lean LLM micro-classification (only 3 history turns, capped 60 tokens)
    const [history, timeContext] = await Promise.all([
      this.messageService.getRecentHistory(tenantId, conversationId, 3, latestMessage),
      this.timeContextService.getTimeContext(tenantId, conversationId),
    ]);

    const previousAgentLabel = previousAgent ? PREVIOUS_AGENT_LABEL[previousAgent] : undefined;
    let systemPrompt = previousAgentLabel
      ? `${ROUTER_SYSTEM_PROMPT}\n\nPrevious agent: ${previousAgentLabel}`
      : ROUTER_SYSTEM_PROMPT;

    systemPrompt += `\n\nCurrent Date & Time (${timeContext.timezone}): ${timeContext.formatted}`;

    const result = await this.aiProviderService.complete(
      tenantId,
      AgentType.ROUTER,
      [
        { role: 'system', content: systemPrompt, cacheControl: true },
        ...history,
        { role: 'user', content: latestMessage },
      ],
      {
        conversationId,
        responseFormat: 'json',
      },
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

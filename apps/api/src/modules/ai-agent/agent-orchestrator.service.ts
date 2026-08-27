import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AgentType, HandoffReason } from '@prisma/client';
import { EVENT_TYPES } from '../../events/event-types.const';
import type { MessageReceivedPayload } from '../../events/event-types.const';
import { RouterAgentService } from './router-agent.service';
import { SupportAgentService } from './support-agent.service';
import { KnowledgeAgentService } from './knowledge-agent.service';
import { ActionAgentService } from './action-agent.service';
import { ResponseService } from '../conversation/response.service';
import { HumanHandoffService } from '../human-handoff/human-handoff.service';

const LOW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * AgentOrchestratorService — the glue between the event bus and the
 * multi-agent pipeline. Listens for MESSAGE_RECEIVED, asks the Router which
 * specialized agent should handle this turn, dispatches to exactly ONE of
 * them (or to human handoff on low confidence / explicit human_handoff
 * intent), and hands the result to ResponseService. The whole handler is
 * wrapped in try/catch: any unhandled failure anywhere in the pipeline
 * degrades to a human handoff rather than leaving the customer without a
 * reply.
 *
 * Requires `@nestjs/event-emitter`'s EventEmitterModule.forRoot() to be
 * registered somewhere in AppModule for @OnEvent to fire (Agent 1's
 * bootstrap — EventService is presumably built on the same EventEmitter2
 * instance).
 */
@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly routerAgentService: RouterAgentService,
    private readonly supportAgentService: SupportAgentService,
    private readonly knowledgeAgentService: KnowledgeAgentService,
    private readonly actionAgentService: ActionAgentService,
    private readonly responseService: ResponseService,
    private readonly humanHandoffService: HumanHandoffService,
  ) {}

  @OnEvent(EVENT_TYPES.MESSAGE_RECEIVED)
  async handleMessage(payload: MessageReceivedPayload): Promise<void> {
    const { tenantId, conversationId, content } = payload;

    try {
      const route = await this.routerAgentService.route(tenantId, conversationId, content);

      if (route.agent === 'human_handoff' || route.confidence < LOW_CONFIDENCE_THRESHOLD) {
        await this.humanHandoffService.create(
          tenantId,
          conversationId,
          route.agent === 'human_handoff' ? HandoffReason.CUSTOMER_REQUEST : HandoffReason.LOW_CONFIDENCE,
        );
        await this.responseService.sendResponse({
          tenantId,
          conversationId,
          content: "I've connected you with our team. A representative will assist you shortly.",
          agentType: AgentType.HUMAN,
        });
        return;
      }

      let replyContent: string;
      let agentType: AgentType;

      switch (route.agent) {
        case 'knowledge_agent':
          replyContent = await this.knowledgeAgentService.respond(tenantId, conversationId, content);
          agentType = AgentType.KNOWLEDGE;
          break;
        case 'action_agent':
          replyContent = await this.actionAgentService.respond(tenantId, conversationId, content);
          agentType = AgentType.ACTION;
          break;
        case 'support_agent':
        default:
          replyContent = await this.supportAgentService.respond(tenantId, conversationId, content);
          agentType = AgentType.SUPPORT;
          break;
      }

      await this.responseService.sendResponse({ tenantId, conversationId, content: replyContent, agentType });
    } catch (err) {
      this.logger.error(
        `Agent pipeline failed for tenant=${tenantId} conversation=${conversationId}: ${(err as Error).message}`,
      );
      try {
        await this.humanHandoffService.create(tenantId, conversationId, HandoffReason.REPEATED_FAILURE);
        await this.responseService.sendResponse({
          tenantId,
          conversationId,
          content:
            "I'm sorry, I encountered an issue processing your request. A team member has been notified and will assist you shortly.",
          agentType: AgentType.HUMAN,
        });
      } catch (handoffErr) {
        this.logger.error(
          `Human handoff fallback also failed for tenant=${tenantId} conversation=${conversationId}: ${(handoffErr as Error).message}`,
        );
      }
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AgentType, HandoffReason } from '@prisma/client';
import { EVENT_TYPES } from '../../events/event-types.const';
import type { MessageReceivedPayload } from '../../events/event-types.const';
import { PrismaService } from '../../prisma/prisma.service';
import { RouterAgentService } from './router-agent.service';
import { SupportAgentService } from './support-agent.service';
import { KnowledgeAgentService } from './knowledge-agent.service';
import { ActionAgentService } from './action-agent.service';
import { ResponseService } from '../conversation/response.service';
import { ConversationSummaryService } from '../conversation/conversation-summary.service';
import { HumanHandoffService } from '../human-handoff/human-handoff.service';
import { customerMessage, LanguageTag, resolveReplyLanguage } from '../../common/language/language';

const LOW_CONFIDENCE_THRESHOLD = 0.5;

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routerAgentService: RouterAgentService,
    private readonly supportAgentService: SupportAgentService,
    private readonly knowledgeAgentService: KnowledgeAgentService,
    private readonly actionAgentService: ActionAgentService,
    private readonly responseService: ResponseService,
    private readonly conversationSummaryService: ConversationSummaryService,
    private readonly humanHandoffService: HumanHandoffService,
  ) {}

  @OnEvent(EVENT_TYPES.MESSAGE_RECEIVED)
  async handleMessage(payload: MessageReceivedPayload): Promise<void> {
    const { tenantId, conversationId, content } = payload;
    let language: LanguageTag = 'en';

    try {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        select: {
          currentAgent: true,
          language: true,
          tenant: { select: { defaultLanguage: true, matchCustomerLanguage: true } },
        },
      });
      language = resolveReplyLanguage(conversation?.language, conversation?.tenant);

      const route = await this.routerAgentService.route(
        tenantId,
        conversationId,
        content,
        conversation?.currentAgent,
      );

      if (route.agent === 'human_handoff' || route.confidence < LOW_CONFIDENCE_THRESHOLD) {
        await this.humanHandoffService.create(
          tenantId,
          conversationId,
          route.agent === 'human_handoff' ? HandoffReason.CUSTOMER_REQUEST : HandoffReason.LOW_CONFIDENCE,
        );
        await this.responseService.sendResponse({
          tenantId,
          conversationId,
          content: customerMessage('handoff_connected', language),
          agentType: AgentType.HUMAN,
        });
        return;
      }

      let replyContent: string;
      let agentType: AgentType;
      const turn = { language, searchQuery: route.searchQuery };

      switch (route.agent) {
        case 'knowledge_agent':
          replyContent = await this.knowledgeAgentService.respond(tenantId, conversationId, content, turn);
          agentType = AgentType.KNOWLEDGE;
          break;
        case 'action_agent':
          replyContent = await this.actionAgentService.respond(tenantId, conversationId, content, turn);
          agentType = AgentType.ACTION;
          break;
        case 'support_agent':
        default:
          replyContent = await this.supportAgentService.respond(tenantId, conversationId, content, turn);
          agentType = AgentType.SUPPORT;
          break;
      }

      // Remember which specialist handled this turn so the Router can route
      // follow-up messages ("yes", a bare phone number, …) back to it.
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { currentAgent: agentType },
      });

      await this.responseService.sendResponse({ tenantId, conversationId, content: replyContent, agentType });

      // Rolling Context Windowing (MindStudio Technique 6 & Rule 9):
      // Asynchronously check and summarize older conversation turns in the background
      void this.conversationSummaryService.maybeSummarize(tenantId, conversationId);
    } catch (err) {
      this.logger.error(
        `Agent pipeline failed for tenant=${tenantId} conversation=${conversationId}: ${(err as Error).message}`,
      );
      try {
        await this.humanHandoffService.create(tenantId, conversationId, HandoffReason.REPEATED_FAILURE);
        await this.responseService.sendResponse({
          tenantId,
          conversationId,
          content: customerMessage('pipeline_error', language),
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

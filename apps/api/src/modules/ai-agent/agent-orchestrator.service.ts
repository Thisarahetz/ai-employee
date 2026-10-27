import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AgentType, HandoffReason, ReplyMode, SavedAnswer } from '@prisma/client';
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
import { ReplyPolicyService } from '../reply-engine/reply-policy.service';
import { SavedAnswerService } from '../reply-engine/saved-answer.service';
import { customerMessage, CustomerMessageKey, LanguageTag, resolveReplyLanguage } from '../../common/language/language';
import {
  AnswerMatch,
  DIRECT_MATCH_SCORE,
  HINT_MATCH_SCORE,
  answerInLanguage,
  looksLikeActionRequest,
  quickReplyKind,
} from '../../common/reply/answer-matcher';
import { fastPathRoute } from './fast-path-router.util';
import { NluService } from '../nlu/nlu.service';
import type { NluDecision, NluTrace } from '../nlu/nlu.types';
import type { AgentTurn } from './agent-turn';

const LOW_CONFIDENCE_THRESHOLD = 0.5;

/** Where a reply came from; stored on the message for the savings report. */
type ReplySource = 'ai' | 'saved_answer' | 'template' | 'handoff' | 'clarify';

interface TurnContext {
  tenantId: string;
  conversationId: string;
  content: string;
  language: LanguageTag;
  businessName: string;
  /** The customer is on a phone call: replies are spoken, and unclear speech is asked about again. */
  voice?: boolean;
  /** What Rasa decided for this message; stored on the reply (no message text). */
  nlu?: { decision: NluDecision; trace: NluTrace };
}

/**
 * Decides how each customer message is answered:
 *
 *   person asked for     → hand to staff (no AI, every mode)
 *   greeting / thanks    → fixed reply            (Hybrid, No-AI)
 *   saved answer matches → the saved answer       (Hybrid, No-AI)
 *   No-AI, nothing fits  → hand to staff, keep the question as a suggestion
 *   otherwise            → AI agents, with close saved answers as approved facts
 *
 * When the AI budget is used up or the AI fails, it falls back to a saved
 * answer and then to staff, never to silence or a broken reply.
 */
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
    private readonly replyPolicy: ReplyPolicyService,
    private readonly savedAnswers: SavedAnswerService,
    private readonly nlu: NluService,
  ) {}

  @OnEvent(EVENT_TYPES.MESSAGE_RECEIVED)
  async handleMessage(payload: MessageReceivedPayload): Promise<void> {
    const { tenantId, conversationId, content } = payload;
    const ctx: TurnContext = { tenantId, conversationId, content, language: 'en', businessName: '' };
    let match: AnswerMatch<SavedAnswer> | null | undefined;

    try {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        select: {
          status: true,
          currentAgent: true,
          language: true,
          channel: { select: { type: true } },
          tenant: { select: { name: true, defaultLanguage: true, matchCustomerLanguage: true, smartRouting: true } },
        },
      });
      if (!conversation) return;
      // A staff member has taken over this chat: they reply, not the AI.
      if (conversation.status === 'HUMAN_HANDLING') return;

      ctx.language = resolveReplyLanguage(conversation.language, conversation.tenant);
      ctx.businessName = conversation.tenant.name;
      ctx.voice = conversation.channel?.type === 'VOICE';
      const { effectiveMode: mode } = await this.replyPolicy.getSettings(tenantId);

      // 1. The customer asked for a person — same in every mode, no AI.
      if (fastPathRoute(content)?.agent === 'human_handoff') {
        await this.handOff(ctx, HandoffReason.CUSTOMER_REQUEST, 'handoff_connected', { force: true });
        return;
      }

      let hints: string[] = [];
      // 2. Greeting or thanks on its own. The strict patterns come first (free);
      // Rasa then classifies everything else, once, for every mode.
      const quick = mode !== ReplyMode.AI ? quickReplyKind(content) : null;
      if (quick) {
        await this.send(ctx, customerMessage(quick, ctx.language, { business: ctx.businessName }), 'template', AgentType.SUPPORT);
        return;
      }
      ctx.nlu = await this.nlu.classify(content, { previousAgent: conversation.currentAgent, enabled: conversation.tenant.smartRouting });
      const decision = ctx.nlu.decision;
      if (mode !== ReplyMode.AI) {
        if (decision.path === 'rasa' && decision.template) {
          await this.send(ctx, customerMessage(decision.template, ctx.language, { business: ctx.businessName }), 'template', AgentType.SUPPORT);
          return;
        }

        // 3. Saved answers. A reply to an in-progress booking ("yes", a phone
        // number) belongs to the booking, not to a saved answer.
        const continuingBooking =
          conversation.currentAgent === AgentType.ACTION && fastPathRoute(content, AgentType.ACTION)?.agent === 'action_agent';
        match = continuingBooking ? null : await this.savedAnswers.match(tenantId, content);
        const isActionRequest = continuingBooking || looksLikeActionRequest(content);

        if (match && match.score >= DIRECT_MATCH_SCORE && !(mode === ReplyMode.HYBRID && isActionRequest)) {
          const reply = answerInLanguage(match.answer, ctx.language);
          // In Hybrid, a missing translation goes to the AI with the saved answer as the facts.
          if (reply.text && (reply.exact || mode === ReplyMode.NO_AI)) {
            await this.sendSavedAnswer(ctx, match.answer, reply.text);
            return;
          }
        }

        // 4. No-AI and nothing fits: a person answers.
        if (mode === ReplyMode.NO_AI) {
          await this.noAnswer(ctx);
          return;
        }

      } else {
        // AI mode still gives the AI any close saved answer as an approved fact.
        match = await this.savedAnswers.match(tenantId, content);
      }
      if (match && match.score >= HINT_MATCH_SCORE) {
        hints = [answerInLanguage(match.answer, ctx.language).text].filter(Boolean);
      }

      // 5. AI — only while the business has AI budget left.
      if (!(await this.replyPolicy.aiBudgetAvailable(tenantId))) {
        this.logger.warn(`AI budget used up for tenant=${tenantId}; replying without AI.`);
        await this.replyWithoutAi(ctx, match);
        return;
      }

      await this.replyWithAi(ctx, conversation.currentAgent, hints, ctx.nlu?.decision);
    } catch (err) {
      this.logger.error(
        `Reply failed for tenant=${tenantId} conversation=${conversationId}: ${(err as Error).message}`,
      );
      try {
        await this.replyWithoutAi(ctx, match, 'pipeline_error');
      } catch (fallbackErr) {
        this.logger.error(
          `Fallback reply also failed for tenant=${tenantId} conversation=${conversationId}: ${(fallbackErr as Error).message}`,
        );
      }
    }
  }

  private async replyWithAi(ctx: TurnContext, currentAgent: AgentType | null, hints: string[], nlu?: NluDecision) {
    const { tenantId, conversationId, content } = ctx;
    const route = await this.routerAgentService.route(tenantId, conversationId, content, currentAgent, nlu);

    if (route.agent !== 'human_handoff' && route.confidence < LOW_CONFIDENCE_THRESHOLD && ctx.voice && !(await this.justAskedToRepeat(ctx))) {
      // Speech is often misheard: ask once before bringing in a person.
      await this.send(ctx, customerMessage('clarify', ctx.language), 'clarify', AgentType.SUPPORT);
      return;
    }

    if (route.agent === 'human_handoff' || route.confidence < LOW_CONFIDENCE_THRESHOLD) {
      await this.handOff(
        ctx,
        route.agent === 'human_handoff' ? HandoffReason.CUSTOMER_REQUEST : HandoffReason.LOW_CONFIDENCE,
        'handoff_connected',
        { force: true },
      );
      return;
    }

    const turn: AgentTurn = { language: ctx.language, searchQuery: route.searchQuery, approvedAnswers: hints, spoken: ctx.voice };
    let replyContent: string;
    let agentType: AgentType;
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

    // Remember which specialist handled this turn so follow-ups ("yes", a
    // bare phone number) go back to it.
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { currentAgent: agentType } });
    await this.send(ctx, replyContent, 'ai', agentType);

    // Summarise older turns in the background so prompts stay small.
    void this.conversationSummaryService.maybeSummarize(tenantId, conversationId);
  }

  /** True when our last reply in this conversation was already "could you say that again?". */
  private async justAskedToRepeat(ctx: TurnContext): Promise<boolean> {
    const last = await this.prisma.message.findFirst({
      where: { tenantId: ctx.tenantId, conversationId: ctx.conversationId, sender: 'AI' },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    return (last?.metadata as { replySource?: string } | null)?.replySource === 'clarify';
  }

  /** AI unavailable (budget used up or it failed): a saved answer if one fits, else staff. */
  private async replyWithoutAi(
    ctx: TurnContext,
    known: AnswerMatch<SavedAnswer> | null | undefined,
    fallbackKey: CustomerMessageKey = 'handoff_no_answer',
  ) {
    const match = known === undefined ? await this.savedAnswers.match(ctx.tenantId, ctx.content) : known;
    if (match && match.score >= DIRECT_MATCH_SCORE) {
      const reply = answerInLanguage(match.answer, ctx.language);
      if (reply.text) {
        await this.sendSavedAnswer(ctx, match.answer, reply.text);
        return;
      }
    }
    await this.noAnswer(ctx, fallbackKey);
  }

  private async sendSavedAnswer(ctx: TurnContext, answer: SavedAnswer, text: string) {
    await this.send(ctx, text, 'saved_answer', AgentType.KNOWLEDGE, { savedAnswerId: answer.id });
    this.savedAnswers.recordUse(answer.id);
  }

  /** Nothing could answer: keep the question for the owner and bring in a person. */
  private async noAnswer(ctx: TurnContext, key: CustomerMessageKey = 'handoff_no_answer') {
    await this.savedAnswers.recordUnanswered(ctx.tenantId, ctx.content, ctx.conversationId);
    await this.handOff(
      ctx,
      key === 'pipeline_error' ? HandoffReason.REPEATED_FAILURE : HandoffReason.UNSUPPORTED_REQUEST,
      key,
    );
  }

  /**
   * Creates a staff handoff and tells the customer. While one is already
   * waiting, follow-up messages don't repeat "a team member will reply"
   * (unless `force`, e.g. the customer explicitly asks for a person).
   */
  private async handOff(ctx: TurnContext, reason: HandoffReason, key: CustomerMessageKey, opts: { force?: boolean } = {}) {
    const waiting = await this.prisma.humanHandoff.findFirst({
      where: { tenantId: ctx.tenantId, conversationId: ctx.conversationId, status: { in: ['PENDING', 'ACTIVE'] } },
      select: { id: true },
    });
    if (waiting && !opts.force) return;
    if (!waiting) await this.humanHandoffService.create(ctx.tenantId, ctx.conversationId, reason);
    await this.send(ctx, customerMessage(key, ctx.language, { business: ctx.businessName }), 'handoff', AgentType.HUMAN);
  }

  private send(ctx: TurnContext, content: string, source: ReplySource, agentType: AgentType, extra: Record<string, unknown> = {}) {
    return this.responseService.sendResponse({
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      content,
      agentType,
      metadata: { replySource: source, ...(ctx.nlu ? { nlu: ctx.nlu.trace } : {}), ...extra },
    });
  }
}

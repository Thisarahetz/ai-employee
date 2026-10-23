import { Injectable } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { TimeContextService } from './time-context.service';
import { AgentTurn, DEFAULT_TURN } from './agent-turn';
import { replyLanguageInstruction } from '../../common/language/language';

const DEFAULT_SUPPORT_PROMPT =
  'You are a professional customer support agent for the business.';

const CAVEMAN_SUPPORT_GUARDRAIL =
  'CONCISE COMMUNICATION DIRECTIVE (TOKEN EFFICIENCY):\n' +
  '- Be direct, concise, and professional.\n' +
  '- Omit pleasantries, conversational filler, and hedging ("Sure, I can help!", "Thank you for reaching out").\n' +
  '- Answer directly in 1 to 3 sentences.\n' +
  '- Never repeat the customer\'s question or narrate what you are doing.';

@Injectable()
export class SupportAgentService {
  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly messageService: MessageService,
    private readonly prisma: PrismaService,
    private readonly timeContextService: TimeContextService,
  ) {}

  async respond(
    tenantId: string,
    conversationId: string,
    latestMessage: string,
    turn: AgentTurn = DEFAULT_TURN,
  ): Promise<string> {
    const [history, aiAgent, timeContext] = await Promise.all([
      this.messageService.getRecentHistory(tenantId, conversationId, 6, latestMessage),
      this.prisma.aiAgent.findUnique({
        where: { tenantId_type: { tenantId, type: AgentType.SUPPORT } },
      }),
      this.timeContextService.getTimeContext(tenantId, conversationId),
    ]);

    const persona = aiAgent?.systemPrompt?.trim() || DEFAULT_SUPPORT_PROMPT;
    // Static prompt prefix: persona + guardrails (100% cacheable across all requests)
    // Static prompt prefix: persona + guardrails + reply language (cacheable per language)
    const staticSystemPrompt = `${persona}\n\n${CAVEMAN_SUPPORT_GUARDRAIL}\n\n${replyLanguageInstruction(turn.language)}`;
    const approved = (turn.approvedAnswers ?? []).filter(Boolean);
    const approvedBlock = approved.length
      ? `\n[Approved answers from the business — use these facts if they fit the question:\n${approved.map((a) => `- ${a}`).join('\n')}]`
      : '';
    const dynamicTimeTurn = `[Context: Current Date & Time in timezone ${timeContext.timezone}: ${timeContext.formatted}]${approvedBlock}`;

    const result = await this.aiProviderService.complete(
      tenantId,
      AgentType.SUPPORT,
      [
        { role: 'system', content: staticSystemPrompt, cacheControl: true },
        ...history,
        { role: 'user', content: `${dynamicTimeTurn}\n\n${latestMessage}` },
      ],
      { conversationId },
    );

    return result.content;
  }
}


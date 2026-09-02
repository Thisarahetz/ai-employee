import { Injectable } from '@nestjs/common';
import { AgentType, Message, MessageContentType, MessageSender, Prisma } from '@prisma/client';
import { paginationSkip, toPaginatedResponse, toPaginationRequest } from '@ai-employee/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateMessageParams {
  tenantId: string;
  conversationId: string;
  sender: MessageSender;
  agentType?: AgentType;
  content: string;
  contentType?: MessageContentType;
  metadata?: Record<string, unknown>;
}

/** One recent conversation turn, shaped for an LLM chat-completion call. */
export interface AgentHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  create(params: CreateMessageParams): Promise<Message> {
    return this.prisma.message.create({
      data: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        sender: params.sender,
        agentType: params.agentType,
        content: params.content,
        contentType: params.contentType ?? MessageContentType.TEXT,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /** Paginated history, oldest-first, for `GET /conversations/:id/messages`. */
  async list(tenantId: string, conversationId: string, page = 1, pageSize = 20) {
    const pagination = toPaginationRequest({ page, pageSize });
    const where = { tenantId, conversationId };
    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: paginationSkip(pagination),
        take: pagination.pageSize,
      }),
      this.prisma.message.count({ where }),
    ]);
    return toPaginatedResponse(data, total, pagination);
  }

  /**
   * Newest-first, capped list — used by AI context loaders (Router/Support/
   * Knowledge/Action agents) to build recent-turn context without paging.
   */
  getRecentMessages(tenantId: string, conversationId: string, limit = 20): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * The recent conversation as oldest-first chat turns for an AI agent.
   * Non-customer senders (AI / HUMAN_AGENT / SYSTEM) are all folded into
   * 'assistant' — this is a scaffold, not a full role-fidelity replay. Pass
   * `omitLastContent` with the just-received inbound text so the trailing
   * duplicate customer turn is dropped when the caller re-adds it as the final
   * message.
   */
  async getRecentHistory(
    tenantId: string,
    conversationId: string,
    limit = 10,
    omitLastContent?: string,
  ): Promise<AgentHistoryTurn[]> {
    const recent = await this.getRecentMessages(tenantId, conversationId, limit);
    const chronological = [...recent].reverse();
    return chronological
      .filter(
        (m, idx) =>
          !(idx === chronological.length - 1 && omitLastContent !== undefined && m.content === omitLastContent),
      )
      .map((m) => ({
        role: m.sender === MessageSender.CUSTOMER ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));
  }
}

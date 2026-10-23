import { Injectable, Logger } from '@nestjs/common';
import { AgentType, ReversibilityType } from '@prisma/client';
import type { AIMessage, AIToolCall } from '@ai-employee/ai-core';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { AiToolsService } from '../ai-tools/ai-tools.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { ExternalActionService } from '../external-action/external-action.service';
import { TimeContextService } from './time-context.service';
import { DynamicSagaService } from '../saga/dynamic-saga.service';
import { PolicySynthesisService } from '../policy-synthesis/policy-synthesis.service';
import { ToolOutputCompressorService } from './tool-output-compressor.service';
import { AgentTurn, DEFAULT_TURN } from './agent-turn';
import { claimsBooking, customerMessage, replyLanguageInstruction, wantsRollback } from '../../common/language/language';

const DEFAULT_ACTION_PROMPT =
  'You are an action-taking assistant that handles bookings, lookups and updates for the business.';

/**
 * Appended to whatever persona prompt the tenant configured.
 * Includes Caveman concise communication directives to cut output and reasoning tokens by 50%+.
 */
const ACTION_GUARDRAIL = [
  'CONCISE DIRECTIVE (TOKEN EFFICIENCY):',
  '- Be direct, concise, and professional.',
  '- Omit pleasantries, conversational filler, and hedging ("Sure, let me check that!", "I will gladly assist").',
  '- Never repeat the customer prompt or explain which tools you are about to run.',
  '- Directly ask for missing required information or report confirmed tool outcomes.',
  '',
  'OPERATIONAL RULES:',
  '- Use the available tools to carry out the request.',
  '- Collect required details (service, date/time, customer name, customer phone) from recent conversation.',
  '- You may call tools over multiple steps (e.g. look up services, then call create_appointment).',
  '- PHONE NUMBER IS MANDATORY: You MUST ask for phone number before booking if not already known.',
  '- PREFERRED TIME & DATE: If not specified, ask for it. DO NOT invent or fabricate a time.',
  '- CONFIRMATION: Never claim an appointment is booked unless create_appointment succeeded in this turn.',
  '- TOOL PARAMETERS: When calling create_appointment, pass variantId, customerFirstName, customerLastName (if known), customerPhone, and startTime in ISO format matching business timezone.',
  '- If a tool reports a failure, concisely explain what is needed.',
].join('\n');

/** Max model↔tool round trips before we force a plain-text reply. */
const MAX_TOOL_STEPS = 4;


interface ExecutedToolResult {
  name: string;
  resultSummary: string;
}

@Injectable()
export class ActionAgentService {
  private readonly logger = new Logger(ActionAgentService.name);

  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly aiToolsService: AiToolsService,
    private readonly externalActionService: ExternalActionService,
    private readonly prisma: PrismaService,
    private readonly messageService: MessageService,
    private readonly eventService: EventService,
    private readonly timeContextService: TimeContextService,
    private readonly dynamicSagaService: DynamicSagaService,
    private readonly policySynthesisService: PolicySynthesisService,
    private readonly toolOutputCompressorService: ToolOutputCompressorService,
  ) {}

  async respond(
    tenantId: string,
    conversationId: string,
    latestMessage: string,
    turn: AgentTurn = DEFAULT_TURN,
  ): Promise<string> {
    const FALLBACK_REPLY = customerMessage('action_fallback', turn.language);
    const [tools, history, aiAgent, timeContext, conversation, activeInvariants, activeSaga] = await Promise.all([
      this.aiToolsService.getToolsForTenant(tenantId),
      this.messageService.getRecentHistory(tenantId, conversationId, 10, latestMessage),
      this.prisma.aiAgent.findUnique({
        where: { tenantId_type: { tenantId, type: AgentType.ACTION } },
      }),
      this.timeContextService.getTimeContext(tenantId, conversationId),
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: true },
      }),
      this.policySynthesisService.getActiveInvariants(tenantId),
      this.dynamicSagaService.getOrCreateActiveSaga(tenantId, conversationId),
    ]);

    // Check for explicit customer cancellation/rollback intent under TEO-PIPS
    if (wantsRollback(latestMessage) && activeSaga.steps.length > 0) {
      await this.dynamicSagaService.compensateSaga(activeSaga.id, 'Customer requested cancellation/undo');
      return customerMessage('request_rolled_back', turn.language);
    }

    const persona = aiAgent?.systemPrompt?.trim() || DEFAULT_ACTION_PROMPT;
    const customer = conversation?.customer;
    const customerInfo =
      customer?.name || customer?.email || customer?.phone
        ? [
            'KNOWN CUSTOMER DETAILS:',
            customer.name ? `- Name: ${customer.name}` : '',
            customer.phone ? `- Phone: ${customer.phone}` : '',
            customer.email ? `- Email: ${customer.email}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

    const invariantsContext =
      activeInvariants.length > 0
        ? [
            'ACTIVE OPERATIONAL INVARIANTS (LEARNED FROM SUPERVISION):',
            ...activeInvariants.map(
              (inv) => `- [${inv.name}]: ${inv.description} (Rule: ${JSON.stringify(inv.conditionRule)})`,
            ),
          ].join('\n')
        : '';

    const temporalGuardrail = [
      'TEMPORAL CONTEXT & TIMEZONE:',
      `- Current Date & Time: ${timeContext.formatted}`,
      `- Current Day of the Week: ${timeContext.dayOfWeek}`,
      `- Current Date (YYYY-MM-DD): ${timeContext.isoDate}`,
      `- Current Time: ${timeContext.timeString}`,
      `- Business Timezone: ${timeContext.timezone} (${timeContext.offset})`,
      timeContext.locationsSummary ? `- Available Locations:\n${timeContext.locationsSummary}` : '',
      'RULES FOR DATES & TIMES:',
      `1. All relative dates (e.g. "today", "tomorrow", "this Friday", "next Tuesday", "in 2 hours") MUST be calculated relative to Current Date (${timeContext.isoDate}, ${timeContext.dayOfWeek}) and Current Time (${timeContext.timeString}) in timezone ${timeContext.timezone}.`,
      `2. When calling booking tools (like create_appointment) that accept an ISO timestamp (e.g. startTime), format it with the exact date, time, and timezone offset matching ${timeContext.timezone} (for example: "${timeContext.isoDate}T14:00:00${timeContext.offset}").`,
      `3. Never assume dates from past years; the current year is ${timeContext.year}.`,
    ]
      .filter(Boolean)
      .join('\n');

    // 1. Static prompt prefix: persona + guardrails + invariants (100% cacheable across calls)
    const staticSystemPrompt = [persona, ACTION_GUARDRAIL, invariantsContext, replyLanguageInstruction(turn.language)]
      .filter(Boolean)
      .join('\n\n');

    // 2. Dynamic context: customer details + real-time clock (isolated from static prefix to preserve cache)
    const dynamicContext = [
      customerInfo ? `[Customer Details]\n${customerInfo}` : '',
      temporalGuardrail,
    ]
      .filter(Boolean)
      .join('\n\n');

    const baseMessages: AIMessage[] = [
      { role: 'system', content: staticSystemPrompt, cacheControl: true },
      ...history,
      { role: 'user', content: `${dynamicContext}\n\nCustomer Request: ${latestMessage}` },
    ];

    if (tools.length === 0) {
      this.logger.warn(`No enabled IntegrationAction tools for tenant=${tenantId}; answering without tools.`);
      const result = await this.aiProviderService.complete(tenantId, AgentType.ACTION, baseMessages, {
        conversationId,
      });
      return result.content || FALLBACK_REPLY;
    }

    // Bounded model <-> tool loop. Each iteration: ask the model (with tools),
    // run whatever it calls, append the outcome as a plain-text turn, repeat.
    const transcript: AIMessage[] = [];

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      // RTK Compact Transcript: compacts older steps to avoid duplicating large tool dumps
      const compactedTranscript = this.toolOutputCompressorService.compactTranscript(transcript);

      const res = await this.aiProviderService.complete(
        tenantId,
        AgentType.ACTION,
        [...baseMessages, ...compactedTranscript],
        { conversationId, tools },
      );

      if (!res.toolCalls?.length) {
        // Model answered directly (a clarifying question, or the final reply).
        const reply = res.content || FALLBACK_REPLY;
        const hasBooked = transcript.some(
          (t) =>
            t.role === 'user' &&
            t.content.includes('create_appointment') &&
            t.content.includes('"success":true'),
        );

        if (claimsBooking(reply) && !hasBooked) {
          this.logger.warn(
            `Model falsely claimed booking without successful create_appointment for tenant=${tenantId} conversation=${conversationId}`,
          );
          const hasPhone = Boolean(customer?.phone);
          if (!hasPhone) {
            return customerMessage('ask_phone', turn.language);
          }
          return customerMessage('ask_time', turn.language);
        }

        return reply;
      }

      const executed = await this.executeToolCalls(tenantId, conversationId, res.toolCalls, activeSaga.id);

      transcript.push({
        role: 'assistant',
        content: `I called: ${res.toolCalls
          .map((c) => `${c.name}(${JSON.stringify(c.arguments)})`)
          .join('; ')}`,
      });
      transcript.push({
        role: 'user',
        content:
          `Results:\n${executed.map((r) => `- ${r.name}: ${r.resultSummary}`).join('\n')}\n\n` +
          'Next Step: If missing details (phone/time/service), ask concisely. If all details ready, call create_appointment now.',
      });
    }

    this.logger.warn(
      `Action loop hit ${MAX_TOOL_STEPS} steps for tenant=${tenantId} conversation=${conversationId}; forcing a reply.`,
    );
    const wrapUp = await this.aiProviderService.complete(
      tenantId,
      AgentType.ACTION,
      [
        ...baseMessages,
        ...this.toolOutputCompressorService.compactTranscript(transcript),
        {
          role: 'user',
          content:
            'Reply to the customer now in direct, concise language based strictly on what the tool results above confirmed. Use the reply language set in your instructions.',
        },
      ],
      { conversationId },
    );
    return wrapUp.content || FALLBACK_REPLY;
  }

  /**
   * Runs each tool call the model requested against the generic Integration
   * Layer and returns a short, compressed summary of every outcome (success or failure).
   */
  private async executeToolCalls(
    tenantId: string,
    conversationId: string,
    toolCalls: AIToolCall[],
    sagaId: string,
  ): Promise<ExecutedToolResult[]> {
    // Map tool name -> integrationId so we can call ExternalActionService,
    // which is keyed by integration rather than by action name alone.
    const actionRows = await this.prisma.integrationAction.findMany({
      where: { tenantId, isEnabled: true, name: { in: toolCalls.map((tc) => tc.name) } },
      select: { name: true, integrationId: true },
    });
    const integrationByName = new Map(actionRows.map((a) => [a.name, a.integrationId]));

    const executed: ExecutedToolResult[] = [];

    for (const call of toolCalls) {
      const isQuery =
        call.name.startsWith('get_') ||
        call.name.startsWith('check_') ||
        call.name.startsWith('list_') ||
        call.name.startsWith('find_');
      const reversibility = isQuery ? ReversibilityType.QUERY : ReversibilityType.COMPENSATABLE;
      const compensatingAction = call.name === 'create_appointment' ? 'cancel_appointment' : null;

      const integrationId = integrationByName.get(call.name);
      if (!integrationId) {
        executed.push({
          name: call.name,
          resultSummary: JSON.stringify({ success: false, message: `Unknown or disabled action: ${call.name}` }),
        });
        continue;
      }

      try {
        const execResult = await this.externalActionService.executeAction(integrationId, call.name, call.arguments);
        // RTK Semantic Compression: Compress raw tool execution output before feeding to model context
        const compressedSummary = this.toolOutputCompressorService.compressToolResult(call.name, execResult);
        executed.push({ name: call.name, resultSummary: compressedSummary });

        // Record step in dynamic saga transaction log
        await this.dynamicSagaService.recordStep({
          sagaId,
          actionName: call.name,
          reversibility,
          inputPayload: call.arguments,
          outputPayload: (execResult.data ?? null) as Record<string, unknown> | null,
          compensatingAction,
          error: execResult.success ? null : execResult.message,
        });

        await this.eventService.emit(
          tenantId,
          EVENT_TYPES.ACTION_EXECUTED,
          {
            tenantId,
            conversationId,
            integrationId,
            actionName: call.name,
            input: call.arguments,
            result: execResult,
          },
          'ai-agent',
        );

        if (call.name === 'create_appointment' && execResult.success) {
          // Seal the transaction upon verified successful creation
          await this.dynamicSagaService.commitSaga(sagaId);

          const bookingData = (execResult.data ?? {}) as Record<string, unknown>;
          const conv = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { customer: true },
          });
          const args = (call.arguments ?? {}) as Record<string, unknown>;

          await this.eventService.emit(
            tenantId,
            EVENT_TYPES.APPOINTMENT_CREATED,
            {
              tenantId,
              conversationId,
              customerId: conv?.customerId ?? undefined,
              appointmentId: bookingData.appointmentId,
              clientName:
                bookingData.clientName ?? `${args.customerFirstName} ${args.customerLastName || ''}`.trim(),
              service: bookingData.service,
              startTime: bookingData.startTime ?? args.startTime,
              localTime: bookingData.localTime,
              timezone: bookingData.timezone,
              price: bookingData.price,
              customerPhone: args.customerPhone ?? conv?.customer?.phone ?? undefined,
              customerEmail: args.customerEmail ?? conv?.customer?.email ?? undefined,
              customerFirstName: args.customerFirstName,
              customerLastName: args.customerLastName,
            },
            'ai-agent',
          );
        }
      } catch (err) {
        const message = (err as Error).message ?? 'Action execution failed';
        this.logger.error(`Action ${call.name} failed for tenant=${tenantId}: ${message}`);
        executed.push({ name: call.name, resultSummary: JSON.stringify({ success: false, message }) });

        await this.dynamicSagaService.recordStep({
          sagaId,
          actionName: call.name,
          reversibility,
          inputPayload: call.arguments,
          outputPayload: null,
          compensatingAction,
          error: message,
        });
      }
    }

    return executed;
  }
}

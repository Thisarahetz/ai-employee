import { Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import type { AIMessage, AIToolCall } from '@ai-employee/ai-core';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { AiToolsService } from '../ai-tools/ai-tools.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { ExternalActionService } from '../external-action/external-action.service';
import { TimeContextService } from './time-context.service';

const DEFAULT_ACTION_PROMPT =
  'You are an action-taking assistant that handles bookings, lookups and updates for the business.';

/**
 * Appended to whatever persona prompt the tenant configured. Booking is a
 * multi-turn, multi-step task: the required details (service, date/time,
 * name, phone…) arrive across several customer messages, and completing it
 * often needs more than one tool call (e.g. look the service up, THEN book
 * it). The agent must read the whole conversation and chain tools rather
 * than guessing.
 */
const ACTION_GUARDRAIL = [
  'Use the available tools to carry out the request.',
  'Collect every required detail (service, date/time, customer name, customer phone number) from the whole recent conversation, not just the latest message.',
  'You may call tools over several steps — for example look up services/variants with one tool, then call create_appointment with the resolved variantId.',
  'CRITICAL APPOINTMENT BOOKING RULES:',
  '- PHONE NUMBER IS MANDATORY: A customer phone number is strictly required to book an appointment. If the customer has not provided their phone number (and it is not in Known Customer Details), you MUST ask the customer for their phone number before booking. Never call create_appointment without a real phone number from the customer.',
  '- PREFERRED TIME & DATE: If the customer has not specified their preferred time or date, ask the customer for that information. DO NOT invent or fabricate a time.',
  '- CONFIRMATION: You must NEVER tell the customer an appointment is booked, scheduled, or confirmed unless you have successfully executed the create_appointment tool in this conversation and received a confirmed booking result.',
  '- TOOL PARAMETERS: When calling create_appointment, pass variantId, customerFirstName, customerLastName (if known), customerPhone, and startTime formatted with the ISO date, time, and timezone offset matching the business timezone.',
  '- Never claim an action succeeded unless a tool result in this turn confirmed it. If a tool result reports a failure, apologise briefly and explain what is needed.',
].join('\n');

/** Max model↔tool round trips before we force a plain-text reply. */
const MAX_TOOL_STEPS = 4;

const FALLBACK_REPLY =
  "I've noted your request and a team member will follow up shortly to confirm the details.";

interface ExecutedToolResult {
  name: string;
  resultSummary: string;
}

/**
 * ActionAgentService — loads the tenant's currently ENABLED IntegrationAction
 * tools plus the recent conversation turns, then runs a bounded agentic loop:
 * the model may call tools over several steps (results are fed back as
 * plain-text turns, so this works identically on every provider without
 * replaying tool_use turns) until it has enough to reply to the customer.
 */
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
  ) {}

  async respond(tenantId: string, conversationId: string, latestMessage: string): Promise<string> {
    const [tools, history, aiAgent, timeContext, conversation] = await Promise.all([
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
    ]);

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

    const systemPrompt = [persona, ACTION_GUARDRAIL, customerInfo, temporalGuardrail]
      .filter(Boolean)
      .join('\n\n');

    const baseMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: latestMessage },
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
      const res = await this.aiProviderService.complete(
        tenantId,
        AgentType.ACTION,
        [...baseMessages, ...transcript],
        { conversationId, tools },
      );

      if (!res.toolCalls?.length) {
        // Model answered directly (a clarifying question, or the final reply).
        const reply = res.content || FALLBACK_REPLY;
        const claimsBooking =
          /successfully booked|appointment has been (successfully )?booked|appointment is booked|appointment has been confirmed|we look forward to seeing you/i.test(
            reply,
          );
        const hasBooked = transcript.some(
          (t) =>
            t.role === 'user' &&
            t.content.includes('create_appointment') &&
            t.content.includes('"success":true'),
        );

        if (claimsBooking && !hasBooked) {
          this.logger.warn(
            `Model falsely claimed booking without successful create_appointment for tenant=${tenantId} conversation=${conversationId}`,
          );
          const hasPhone = Boolean(customer?.phone);
          if (!hasPhone) {
            return 'To complete your booking, could you please provide your phone number?';
          }
          return 'What time would you prefer for your appointment?';
        }

        return reply;
      }

      const executed = await this.executeToolCalls(tenantId, conversationId, res.toolCalls);

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
          'IMPORTANT INSTRUCTIONS:\n' +
          '1. If you need to perform an action (e.g. create_appointment) and you now have ALL required information (variantId, date, time, customer name, and customer phone number), you MUST call create_appointment now.\n' +
          "2. If you are missing required information (such as the customer's phone number, preferred time, or date), ask the customer for that specific missing detail now.\n" +
          '3. You must NEVER tell the customer their appointment is booked without a successful create_appointment tool result.\n' +
          '4. If all requested actions are completed and confirmed by tool results, reply to the customer in friendly, plain language.',
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
        ...transcript,
        {
          role: 'user',
          content:
            'Reply to the customer now in plain language, based only on what the tool results above confirmed. Do not claim anything a result did not confirm.',
        },
      ],
      { conversationId },
    );
    return wrapUp.content || FALLBACK_REPLY;
  }

  /**
   * Runs each tool call the model requested against the generic Integration
   * Layer and returns a short summary of every outcome (success or failure).
   */
  private async executeToolCalls(
    tenantId: string,
    conversationId: string,
    toolCalls: AIToolCall[],
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
        executed.push({ name: call.name, resultSummary: JSON.stringify(execResult) });

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
      }
    }

    return executed;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { AiToolsService } from '../ai-tools/ai-tools.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { ExternalActionService } from '../external-action/external-action.service';

const ACTION_SYSTEM_PROMPT =
  'You are an action-taking assistant. Use the available tools to fulfill the customer\'s request (bookings, lookups, updates, etc). Only call a tool when you have enough information to do so; otherwise ask a short clarifying question in plain text.';

interface ExecutedToolResult {
  name: string;
  resultSummary: string;
}

/**
 * ActionAgentService — loads ONLY the tenant's currently ENABLED
 * IntegrationAction tools (never the whole integration catalog, never
 * conversation history beyond the latest message). Executes any tool calls
 * the model requests via the generic Integration Layer, then makes one more
 * minimal-context call to phrase the outcome as a natural-language reply.
 */
@Injectable()
export class ActionAgentService {
  private readonly logger = new Logger(ActionAgentService.name);

  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly aiToolsService: AiToolsService,
    private readonly externalActionService: ExternalActionService,
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
  ) {}

  async respond(tenantId: string, conversationId: string, latestMessage: string): Promise<string> {
    const tools = await this.aiToolsService.getToolsForTenant(tenantId);

    if (tools.length === 0) {
      this.logger.warn(`No enabled IntegrationAction tools for tenant=${tenantId}; answering without tools.`);
      const result = await this.aiProviderService.complete(
        tenantId,
        AgentType.ACTION,
        [
          { role: 'system', content: ACTION_SYSTEM_PROMPT },
          { role: 'user', content: latestMessage },
        ],
        { conversationId },
      );
      return result.content;
    }

    const first = await this.aiProviderService.complete(
      tenantId,
      AgentType.ACTION,
      [
        { role: 'system', content: ACTION_SYSTEM_PROMPT },
        { role: 'user', content: latestMessage },
      ],
      { conversationId, tools },
    );

    if (!first.toolCalls?.length) {
      // Model answered directly (e.g. asked a clarifying question) — no
      // action to execute.
      return first.content;
    }

    // Map tool name -> integrationId so we can call ExternalActionService,
    // which is keyed by integration rather than by action name alone.
    const actionRows = await this.prisma.integrationAction.findMany({
      where: { tenantId, isEnabled: true, name: { in: first.toolCalls.map((tc) => tc.name) } },
      select: { name: true, integrationId: true },
    });
    const integrationByName = new Map(actionRows.map((a) => [a.name, a.integrationId]));

    const executed: ExecutedToolResult[] = [];

    for (const call of first.toolCalls) {
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
      } catch (err) {
        const message = (err as Error).message ?? 'Action execution failed';
        this.logger.error(`Action ${call.name} failed for tenant=${tenantId}: ${message}`);
        executed.push({ name: call.name, resultSummary: JSON.stringify({ success: false, message }) });
      }
    }

    // Turn the raw tool result(s) into a natural-language reply with one
    // more minimal-context call. This is a fresh plain-text request (not a
    // strict tool_result round-trip) so it works identically against both
    // providers without needing to replay the original assistant tool_use
    // turn.
    const summaryLines = executed.map((r) => `- ${r.name}: ${r.resultSummary}`).join('\n');
    const followUp = await this.aiProviderService.complete(
      tenantId,
      AgentType.ACTION,
      [
        {
          role: 'system',
          content:
            'Summarize the following action result(s) as a short, friendly reply to the customer. Do not mention tool names, JSON, or internal fields — describe the outcome in plain language.',
        },
        { role: 'user', content: `Customer asked: "${latestMessage}"\n\nAction result(s):\n${summaryLines}` },
      ],
      { conversationId },
    );

    return followUp.content;
  }
}

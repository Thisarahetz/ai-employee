import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Workflow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { N8nService } from '../n8n/n8n.service';
import { WorkflowService } from './workflow.service';

/**
 * Bridges the internal event bus to n8n. For every value in EVENT_TYPES, subscribes via
 * EventEmitter2.on() (one constructor loop rather than 9 near-identical @OnEvent()
 * methods, since the handling logic doesn't vary by event type — only `eventType`
 * itself does). On each event: looks up enabled Workflow rows for that tenant + trigger
 * event (WorkflowService.findEnabledByTriggerEvent), records a WorkflowExecution per
 * match, and calls N8nService.triggerWorkflow.
 *
 * Per the "n8n failures must not break core AI Employee flow" principle already
 * established in N8nService (it never throws — it logs and resolves to `{}` on
 * failure), the outer try/catch here mainly guards against unexpected Prisma errors;
 * whether the n8n call itself is treated as a SUCCESS or FAILURE is instead read off the
 * `executionId` it returns (empty means "n8n was unreachable or misconfigured" — see
 * N8nService's own logs for the underlying error, which it does not propagate).
 */
@Injectable()
export class WorkflowEventListenerService {
  private readonly logger = new Logger(WorkflowEventListenerService.name);

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
    private readonly n8nService: N8nService,
  ) {
    for (const eventType of Object.values(EVENT_TYPES)) {
      this.emitter.on(eventType, (payload: Record<string, unknown>) => {
        this.handleEvent(eventType, payload).catch((error) =>
          this.logger.error(
            `Unhandled error dispatching workflows for event "${eventType}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      });
    }
  }

  private async handleEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const tenantId = payload.tenantId as string | undefined;
    if (!tenantId) {
      this.logger.warn(`Event "${eventType}" has no tenantId in its payload; skipping workflow dispatch`);
      return;
    }

    const workflows = await this.workflowService.findEnabledByTriggerEvent(tenantId, eventType);
    if (workflows.length === 0) return;

    await Promise.all(workflows.map((workflow) => this.triggerWorkflow(workflow, eventType, tenantId, payload)));
  }

  private async triggerWorkflow(
    workflow: Workflow,
    eventType: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let executionId: string | undefined;

    try {
      const execution = await this.prisma.workflowExecution.create({
        data: {
          tenantId,
          workflowId: workflow.id,
          status: 'PENDING',
          input: payload as Prisma.InputJsonValue,
        },
      });
      executionId = execution.id;

      const result = await this.n8nService.triggerWorkflow(workflow.n8nWorkflowId, {
        tenantId,
        businessId: payload.businessId as string | undefined,
        customerId: payload.customerId as string | undefined,
        conversationId: payload.conversationId as string | undefined,
        eventType,
        data: payload,
      });

      if (result.executionId) {
        await this.prisma.workflowExecution.update({
          where: { id: execution.id },
          data: { status: 'SUCCESS', n8nExecutionId: result.executionId, finishedAt: new Date() },
        });
      } else {
        await this.prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
            status: 'FAILED',
            errorMessage: 'n8n trigger did not return an execution id (see N8nService logs for details)',
            finishedAt: new Date(),
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to trigger workflow ${workflow.id} for event "${eventType}": ${errorMessage}`);

      if (executionId) {
        await this.prisma.workflowExecution
          .update({
            where: { id: executionId },
            data: { status: 'FAILED', errorMessage, finishedAt: new Date() },
          })
          .catch((updateError) =>
            this.logger.error(`Failed to record WorkflowExecution failure for ${executionId}: ${updateError}`),
          );
      }
    }
  }
}

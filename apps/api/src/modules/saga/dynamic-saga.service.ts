import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { ExternalActionService } from '../external-action/external-action.service';
import { ReversibilityType, SagaStatus } from '@prisma/client';

export interface RecordStepParams {
  sagaId: string;
  actionName: string;
  reversibility: ReversibilityType;
  inputPayload: Record<string, unknown>;
  outputPayload?: Record<string, unknown> | null;
  compensatingAction?: string | null;
  error?: string | null;
}

@Injectable()
export class DynamicSagaService {
  private readonly logger = new Logger(DynamicSagaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly externalActionService: ExternalActionService,
  ) {}

  /**
   * Retrieves an existing active saga for this conversation, or initializes a new one.
   */
  async getOrCreateActiveSaga(tenantId: string, conversationId: string) {
    const existing = await this.prisma.dynamicSaga.findFirst({
      where: {
        tenantId,
        conversationId,
        status: SagaStatus.ACTIVE,
      },
      include: { steps: { orderBy: { executedAt: 'asc' } } },
    });

    if (existing) {
      return existing;
    }

    const saga = await this.prisma.dynamicSaga.create({
      data: {
        tenantId,
        conversationId,
        status: SagaStatus.ACTIVE,
      },
      include: { steps: true },
    });

    await this.eventService.emit(tenantId, EVENT_TYPES.SAGA_STARTED, {
      tenantId,
      conversationId,
      sagaId: saga.id,
    });

    return saga;
  }

  /**
   * Records an executed step within the active saga ledger.
   */
  async recordStep(params: RecordStepParams) {
    const { sagaId, actionName, reversibility, inputPayload, outputPayload, compensatingAction, error } = params;

    const step = await this.prisma.sagaStep.create({
      data: {
        sagaId,
        actionName,
        reversibility,
        inputPayload: inputPayload as any,
        outputPayload: (outputPayload ?? null) as any,
        compensatingAction: compensatingAction ?? null,
        error: error ?? null,
      },
    });

    const saga = await this.prisma.dynamicSaga.findUnique({
      where: { id: sagaId },
      select: { tenantId: true, conversationId: true },
    });

    if (saga) {
      await this.eventService.emit(saga.tenantId, EVENT_TYPES.SAGA_STEP_EXECUTED, {
        tenantId: saga.tenantId,
        conversationId: saga.conversationId,
        sagaId,
        stepId: step.id,
        actionName,
        reversibility,
        input: inputPayload,
        output: outputPayload ?? undefined,
      });
    }

    return step;
  }

  /**
   * Executes the compensatory rollback stack in reverse chronological order (LIFO).
   * Restores external business state consistency if a workflow fails or is aborted.
   */
  async compensateSaga(sagaId: string, reason: string): Promise<void> {
    const saga = await this.prisma.dynamicSaga.findUnique({
      where: { id: sagaId },
      include: { steps: { orderBy: { executedAt: 'desc' } } },
    });

    if (!saga || saga.status === SagaStatus.COMPENSATED) {
      return;
    }

    this.logger.warn(`Initiating dynamic saga compensation for sagaId=${sagaId}. Reason: ${reason}`);

    const compensatedStepIds: string[] = [];

    // Filter uncompensated, reversible steps that have a registered compensating action
    const stepsToCompensate = saga.steps.filter(
      (step) =>
        step.reversibility === ReversibilityType.COMPENSATABLE &&
        !step.isCompensated &&
        Boolean(step.compensatingAction),
    );

    for (const step of stepsToCompensate) {
      const compActionName = step.compensatingAction!;
      this.logger.log(`Compensating step ${step.id} (${step.actionName}) using ${compActionName}`);

      // Locate the integration row for the compensating action
      const actionRow = await this.prisma.integrationAction.findFirst({
        where: {
          tenantId: saga.tenantId,
          isEnabled: true,
          name: compActionName,
        },
        select: { integrationId: true },
      });

      if (!actionRow) {
        this.logger.error(
          `Compensating action "${compActionName}" not found or disabled for tenant=${saga.tenantId}. Skipping step ${step.id}.`,
        );
        continue;
      }

      // Map parameters from step input/output into compensation payload
      const stepInput = (step.inputPayload ?? {}) as Record<string, any>;
      const stepOutput = (step.outputPayload ?? {}) as Record<string, any>;

      const compensationPayload: Record<string, unknown> = {
        ...stepInput,
        ...stepOutput,
        reason: `Compensated by TEO-PIPS: ${reason}`,
      };

      try {
        const rollbackResult = await this.externalActionService.executeAction(
          actionRow.integrationId,
          compActionName,
          compensationPayload,
          `saga-comp-${step.id}-${Date.now()}`,
        );

        this.logger.log(
          `Rollback execution result for ${compActionName}: ${JSON.stringify(rollbackResult)}`,
        );

        await this.prisma.sagaStep.update({
          where: { id: step.id },
          data: {
            isCompensated: true,
            compensatedAt: new Date(),
          },
        });

        compensatedStepIds.push(step.id);
      } catch (err) {
        this.logger.error(
          `Failed to execute compensation action ${compActionName} for step ${step.id}: ${(err as Error).message}`,
        );
      }
    }

    // Seal the saga as COMPENSATED
    await this.prisma.dynamicSaga.update({
      where: { id: sagaId },
      data: {
        status: SagaStatus.COMPENSATED,
        failureReason: reason,
      },
    });

    await this.eventService.emit(saga.tenantId, EVENT_TYPES.SAGA_COMPENSATED, {
      tenantId: saga.tenantId,
      conversationId: saga.conversationId,
      sagaId,
      compensatedSteps: compensatedStepIds,
      reason,
    });

    this.logger.log(`Dynamic saga compensation complete for sagaId=${sagaId}.`);
  }

  /**
   * Seals an active saga as COMMITTED once all required workflow steps and terminal actions succeed.
   */
  async commitSaga(sagaId: string) {
    const saga = await this.prisma.dynamicSaga.update({
      where: { id: sagaId },
      data: { status: SagaStatus.COMMITTED },
    });

    await this.eventService.emit(saga.tenantId, EVENT_TYPES.SAGA_COMMITTED, {
      tenantId: saga.tenantId,
      conversationId: saga.conversationId,
      sagaId,
    });

    return saga;
  }

  /**
   * Fetches saga history with steps for diagnostics and dashboard observability.
   */
  async getSagasForConversation(tenantId: string, conversationId: string) {
    return this.prisma.dynamicSaga.findMany({
      where: { tenantId, conversationId },
      include: { steps: { orderBy: { executedAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { currentTaskId } from '../common/execution-context';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * Persists an `Event` row (the durable event-bus log, also consumed by
   * n8n `WorkflowExecution`s) and emits it on `EventEmitter2` so in-process
   * listeners (`@OnEvent(type)`) fire synchronously-ish alongside it.
   */
  async emit(
    tenantId: string,
    type: string,
    payload: Record<string, unknown>,
    sourceService?: string,
  ): Promise<void> {
    // Events caused by an AI workforce task carry its id (see automation loop guard).
    const causedByTaskId = currentTaskId();
    if (causedByTaskId) payload = { ...payload, causedByTaskId };
    await this.prisma.event.create({
      data: {
        tenantId,
        type,
        payload: payload as Prisma.InputJsonValue,
        sourceService,
      },
    });

    // tenantId last: a payload field can never re-route an event to another tenant.
    this.emitter.emit(type, { ...payload, tenantId });
  }
}

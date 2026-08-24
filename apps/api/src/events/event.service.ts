import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
    await this.prisma.event.create({
      data: {
        tenantId,
        type,
        payload: payload as Prisma.InputJsonValue,
        sourceService,
      },
    });

    this.emitter.emit(type, { tenantId, ...payload });
  }
}

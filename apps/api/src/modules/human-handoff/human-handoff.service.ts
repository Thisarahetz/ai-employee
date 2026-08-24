import { Injectable, NotFoundException } from '@nestjs/common';
import { HandoffReason, HandoffStatus } from '@prisma/client';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES } from '../../events/event-types.const';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HumanHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
  ) {}

  list(tenantId: string, status?: HandoffStatus) {
    return this.prisma.humanHandoff.findMany({
      where: { tenantId, status },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string) {
    const handoff = await this.prisma.humanHandoff.findFirst({ where: { id, tenantId } });
    if (!handoff) {
      throw new NotFoundException('Human handoff not found');
    }
    return handoff;
  }

  /**
   * Creates the HumanHandoff row and emits HUMAN_HANDOFF_REQUESTED. Does NOT
   * change the conversation's status — the caller (AI agent or a controller
   * action such as take-control) is responsible for transitioning the
   * conversation itself.
   */
  async create(tenantId: string, conversationId: string, reason: HandoffReason, notes?: string) {
    const handoff = await this.prisma.humanHandoff.create({
      data: { tenantId, conversationId, reason, notes },
    });

    await this.eventService.emit(tenantId, EVENT_TYPES.HUMAN_HANDOFF_REQUESTED, {
      conversationId,
      handoffId: handoff.id,
      reason,
    });

    return handoff;
  }

  async resolve(tenantId: string, id: string, resolvedByUserId: string, notes?: string) {
    const handoff = await this.get(tenantId, id);

    const updated = await this.prisma.humanHandoff.update({
      where: { id: handoff.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        assignedUserId: resolvedByUserId,
        notes: notes ?? handoff.notes,
      },
    });

    await this.eventService.emit(tenantId, EVENT_TYPES.HUMAN_HANDOFF_COMPLETED, {
      conversationId: handoff.conversationId,
      handoffId: handoff.id,
      resolvedBy: resolvedByUserId,
    });

    return updated;
  }
}

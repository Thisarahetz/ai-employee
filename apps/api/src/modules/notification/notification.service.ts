import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { EVENT_TYPES, HumanHandoffRequestedPayload } from '../../events/event-types.const';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(tenantId: string, userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, tenantId, userId },
      data: { isRead: true },
    });
    return { success: true };
  }

  /** Notifies all OWNER/ADMIN users of the tenant when a handoff is requested. */
  @OnEvent(EVENT_TYPES.HUMAN_HANDOFF_REQUESTED)
  async handleHumanHandoffRequested(
    payload: HumanHandoffRequestedPayload & { tenantId: string },
  ): Promise<void> {
    const recipients = await this.prisma.tenantMembership.findMany({
      where: { tenantId: payload.tenantId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      select: { userId: true },
    });

    if (recipients.length === 0) {
      return;
    }

    await this.prisma.notification.createMany({
      data: recipients.map((member) => ({
        tenantId: payload.tenantId,
        userId: member.userId,
        type: EVENT_TYPES.HUMAN_HANDOFF_REQUESTED,
        title: 'Human handoff requested',
        body: `Conversation ${payload.conversationId} needs human attention.`,
        metadata: { conversationId: payload.conversationId, handoffId: payload.handoffId },
      })),
    });
  }
}

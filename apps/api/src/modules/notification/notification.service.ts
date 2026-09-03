import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { EVENT_TYPES, HumanHandoffRequestedPayload } from '../../events/event-types.const';

import { ResendService } from './resend.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resendService: ResendService,
  ) {}

  async sendEmail(payload: { to: string; subject: string; text?: string; html?: string; tenantId?: string }) {
    const result = await this.resendService.sendEmail({
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return {
      success: result.success,
      messageId: result.id || `email_${Date.now()}`,
      status: result.status,
      error: result.error,
    };
  }

  async sendSlack(payload: { text: string; blocks?: any; tenantId?: string }) {
    this.logger.log(`[Slack Dispatched] Text: "${payload.text}"`);
    return { success: true, messageId: `slack_${Date.now()}` };
  }

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

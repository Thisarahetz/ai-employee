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
    // "simulated" means no email provider is configured — nothing was sent.
    const simulated = result.status === 'simulated';
    return {
      success: result.success && !simulated,
      messageId: result.id ?? null,
      status: result.status,
      error: simulated ? 'No email provider is configured (RESEND_API_KEY).' : result.error,
    };
  }

  /**
   * Posts to a Slack incoming webhook (SLACK_INCOMING_WEBHOOK_URL). Returns
   * success only when Slack accepted the message.
   */
  async sendSlack(payload: { text: string; blocks?: any; tenantId?: string }) {
    const url = process.env.SLACK_INCOMING_WEBHOOK_URL?.trim();
    if (!url) return { success: false, messageId: null, status: 'not_configured', error: 'SLACK_INCOMING_WEBHOOK_URL is not set.' };
    if (!/^https:\/\/hooks\.slack\.com\//.test(url)) {
      return { success: false, messageId: null, status: 'not_configured', error: 'SLACK_INCOMING_WEBHOOK_URL must be a https://hooks.slack.com/ URL.' };
    }
    if (!payload?.text?.trim()) return { success: false, messageId: null, status: 'rejected', error: 'text is required' };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payload.text.slice(0, 3000), ...(payload.blocks ? { blocks: payload.blocks } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        this.logger.warn(`Slack webhook rejected the message: ${res.status} ${body}`);
        return { success: false, messageId: null, status: 'failed', error: `Slack responded ${res.status}: ${body}` };
      }
      return { success: true, messageId: null, status: 'sent' };
    } catch (err) {
      return { success: false, messageId: null, status: 'failed', error: (err as Error).message };
    }
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

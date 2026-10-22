import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { EventService } from '../../events/event.service';
import { externalEventProblem } from '../../events/external-event-policy';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt } from '../../common/crypto/encryption.util';

/** Signed requests older/newer than this are rejected (replay protection). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export function signWebhook(secret: string, timestamp: string, rawBody: Buffer | string): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

/**
 * Inbound events from a connected business system. Each integration has its
 * own secret; the sender signs `"<unix-seconds>.<raw body>"` with HMAC-SHA256
 * and sends `X-Timestamp` + `X-Signature` headers. The tenant always comes from
 * the integration record — never from the payload.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
  ) {}

  async handleInbound(
    integrationId: string,
    headers: { signature?: string; timestamp?: string },
    rawBody: Buffer | undefined,
    body: { event?: unknown; [key: string]: unknown },
  ): Promise<{ received: boolean }> {
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    // Same response for unknown integration and bad signature: don't reveal which ids exist.
    if (!integration || !integration.webhookSecretEncrypted) throw new UnauthorizedException('Invalid webhook signature');
    this.verify(decrypt(integration.webhookSecretEncrypted), headers, rawBody);

    const problem = externalEventProblem(body?.event);
    if (problem) throw new BadRequestException(problem);

    const { event, tenantId: _ignored, ...payload } = body;
    await this.eventService.emit(integration.tenantId, event as string, { ...payload, integrationId: integration.id }, 'webhook');
    return { received: true };
  }

  private verify(secret: string, headers: { signature?: string; timestamp?: string }, rawBody: Buffer | undefined) {
    const ts = headers.timestamp?.trim();
    if (!ts || !/^\d{9,11}$/.test(ts) || !headers.signature || !rawBody) throw new UnauthorizedException('Invalid webhook signature');
    if (Math.abs(Date.now() / 1000 - Number(ts)) > WEBHOOK_TOLERANCE_SECONDS) throw new UnauthorizedException('Webhook timestamp outside the allowed window');
    const expected = Buffer.from(signWebhook(secret, ts, rawBody), 'hex');
    const provided = Buffer.from(headers.signature.replace(/^sha256=/i, ''), 'hex');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new UnauthorizedException('Invalid webhook signature');
  }
}

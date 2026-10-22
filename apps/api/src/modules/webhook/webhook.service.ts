import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { EventService } from '../../events/event.service';
import { PrismaService } from '../../prisma/prisma.service';

interface InboundWebhookBody {
  event: string;
  [key: string]: unknown;
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
  ) {}

  /**
   * Verifies the HMAC signature, resolves the owning tenant from the
   * Integration record, then republishes the payload as an `Event` using
   * `payload.event` as the event type (e.g. `booking.created`) — this is
   * how external systems push events per the Webhook Integration spec.
   */
  async handleInbound(
    integrationId: string,
    signature: string | undefined,
    body: InboundWebhookBody,
  ): Promise<{ received: boolean }> {
    this.verifySignature(signature, body);

    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    });
    if (!integration) {
      throw new NotFoundException('Unknown integration');
    }

    const { event, ...payload } = body;
    await this.eventService.emit(integration.tenantId, event, payload, 'webhook');

    return { received: true };
  }

  private verifySignature(signature: string | undefined, body: unknown): void {
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const secret = process.env.WEBHOOK_SIGNING_SECRET;
    // An empty secret would make every signature trivially forgeable.
    if (!secret) throw new UnauthorizedException('Webhook signing is not configured');
    const expected = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}

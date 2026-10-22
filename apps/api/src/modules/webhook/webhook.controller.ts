import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /** Signed events from a connected system — see docs/integration-api-contract.md "Webhooks". */
  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post(':integrationId')
  @HttpCode(202)
  handleInbound(
    @Param('integrationId') integrationId: string,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-timestamp') timestamp: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: { event?: unknown; [key: string]: unknown },
  ) {
    return this.webhookService.handleInbound(integrationId, { signature, timestamp }, req.rawBody, body ?? {});
  }
}

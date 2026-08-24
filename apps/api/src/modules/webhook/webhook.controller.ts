import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Public()
  @Post(':integrationId')
  handleInbound(
    @Param('integrationId') integrationId: string,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: { event: string; [key: string]: unknown },
  ) {
    return this.webhookService.handleInbound(integrationId, signature, body);
  }
}

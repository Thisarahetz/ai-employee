import { Body, Controller, Header, HttpCode, Param, Post, Headers } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { VoiceService } from './voice.service';

/**
 * Twilio's webhooks for a voice channel. Public routes: Twilio calls them, with
 * no user token, and every request is checked against the X-Twilio-Signature of
 * that channel's own auth token. The channel id in the URL picks the business.
 */
@Controller('webhooks/voice/twilio')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** Set as the phone number's "A call comes in" webhook (HTTP POST). */
  @Public()
  @Post('incoming/:channelId')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  incoming(@Param('channelId') channelId: string, @Body() body: Record<string, unknown>, @Headers('x-twilio-signature') signature?: string) {
    return this.voice.incoming(channelId, body ?? {}, signature);
  }

  /** The ConversationRelay `action` URL: runs when the stream ends (transfer to a person, or hang up). */
  @Public()
  @Post('action/:channelId')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  action(@Param('channelId') channelId: string, @Body() body: Record<string, unknown>, @Headers('x-twilio-signature') signature?: string) {
    return this.voice.action(channelId, body ?? {}, signature);
  }
}

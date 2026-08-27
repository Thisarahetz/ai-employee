import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PostWebsiteChatMessageDto } from './dto/post-website-chat-message.dto';
import { WebsiteChatService } from './website-chat.service';
import { WIDGET_JS } from './widget.asset';

/**
 * Public widget endpoints. All routes are @Public() — the embedded widget runs
 * on the customer's own website with no logged-in user. Every route sits at
 * `/channels/website-chat/...` (>=2 path segments after `/channels`), so none
 * collides with `ChannelController`'s `@Get(':id')`.
 */
@Controller('channels/website-chat')
export class WebsiteChatController {
  constructor(private readonly service: WebsiteChatService) {}

  @Public()
  @Get('widget.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  // The widget is embedded via <script src> on other origins (the customer's
  // website), so it must opt out of helmet's default
  // `Cross-Origin-Resource-Policy: same-origin`, which would otherwise make the
  // browser refuse to load it cross-origin.
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  widget(): string {
    return WIDGET_JS;
  }

  @Public()
  @Get(':channelId/config')
  config(@Param('channelId') channelId: string) {
    return this.service.getConfig(channelId);
  }

  @Public()
  @Post(':channelId/messages')
  @HttpCode(200)
  post(@Param('channelId') channelId: string, @Body() dto: PostWebsiteChatMessageDto) {
    return this.service.ingest(channelId, dto);
  }

  @Public()
  @Get(':channelId/messages')
  list(
    @Param('channelId') channelId: string,
    @Query('sessionId') sessionId: string,
    @Query('after') after?: string,
  ) {
    return this.service.getMessages(channelId, sessionId, after);
  }
}

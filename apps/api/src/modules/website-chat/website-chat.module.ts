import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConversationModule } from '../conversation/conversation.module';
import { WebsiteChatController } from './website-chat.controller';
import { WebsiteChatService } from './website-chat.service';

/**
 * Public embedded-widget channel. Imports ConversationModule for
 * ConversationService.ingestInboundMessage (same entry point the WhatsApp
 * webhook uses). Nothing imports this module back, so no forwardRef needed.
 */
@Module({
  imports: [PrismaModule, ConversationModule],
  controllers: [WebsiteChatController],
  providers: [WebsiteChatService],
})
export class WebsiteChatModule {}

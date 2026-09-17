import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
// Owned by the integration-layer agent; see note in response.service.ts.
import { ChannelModule } from '../channel/channel.module';
import { MessageModule } from '../message/message.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ResponseService } from './response.service';
import { ConversationSummaryService } from './conversation-summary.service';

@Module({
  imports: [PrismaModule, MessageModule, ChannelModule, AiProviderModule],
  controllers: [ConversationController],
  providers: [ConversationService, ResponseService, ConversationSummaryService],
  exports: [ConversationService, ResponseService, ConversationSummaryService],
})
export class ConversationModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
// Owned by the integration-layer agent; see note in response.service.ts.
import { ChannelModule } from '../channel/channel.module';
import { MessageModule } from '../message/message.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ResponseService } from './response.service';

@Module({
  imports: [PrismaModule, MessageModule, ChannelModule],
  controllers: [ConversationController],
  providers: [ConversationService, ResponseService],
  exports: [ConversationService, ResponseService],
})
export class ConversationModule {}

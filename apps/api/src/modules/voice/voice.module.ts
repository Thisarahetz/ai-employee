import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ChannelModule } from '../channel/channel.module';
import { ConversationModule } from '../conversation/conversation.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { VoiceSessionsModule } from './voice-sessions.module';
import { VoiceStreamServer } from './voice-stream.server';

@Module({
  imports: [PrismaModule, ChannelModule, ConversationModule, VoiceSessionsModule],
  controllers: [VoiceController],
  providers: [VoiceService, VoiceStreamServer],
})
export class VoiceModule {}

import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { ChannelRegistryService } from './channel-registry.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

// Imported by ConversationModule (for ChannelRegistryService, used by ResponseService).
// See whatsapp.module.ts for the note on the resulting module cycle and forwardRef.
@Module({
  imports: [WhatsAppModule],
  controllers: [ChannelController],
  providers: [ChannelService, ChannelRegistryService],
  exports: [ChannelService, ChannelRegistryService],
})
export class ChannelModule {}

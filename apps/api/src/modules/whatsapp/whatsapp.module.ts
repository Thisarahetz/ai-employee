import { forwardRef, Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppAdapterService } from './whatsapp-adapter.service';
import { ConversationModule } from '../conversation/conversation.module';

/**
 * ConversationModule is imported for ConversationService (WhatsAppController's webhook
 * handler calls ConversationService.ingestInboundMessage). This closes a module cycle —
 * ConversationModule -> ChannelModule -> WhatsAppModule -> ConversationModule — so the
 * reference is wrapped in forwardRef() to avoid a circular-require crash at boot
 * (ConversationModule's own import of ChannelModule does not need the same treatment;
 * only this edge closes the loop).
 */
@Module({
  imports: [forwardRef(() => ConversationModule)],
  controllers: [WhatsAppController],
  providers: [WhatsAppAdapterService],
  exports: [WhatsAppAdapterService],
})
export class WhatsAppModule {}

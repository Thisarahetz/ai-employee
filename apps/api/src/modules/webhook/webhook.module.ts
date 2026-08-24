import { Module } from '@nestjs/common';
import { EventModule } from '../../events/event.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [PrismaModule, EventModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}

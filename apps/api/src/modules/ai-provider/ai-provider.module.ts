import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AiProviderService } from './ai-provider.service';
import { ProviderKeysService } from './provider-keys.service';
import { AiProviderController } from './ai-provider.controller';

/** PrismaService is global, so it is injected without importing PrismaModule. */
@Module({
  imports: [AuditLogModule],
  controllers: [AiProviderController],
  providers: [AiProviderService, ProviderKeysService],
  exports: [AiProviderService, ProviderKeysService],
})
export class AiProviderModule {}

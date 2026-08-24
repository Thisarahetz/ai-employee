import { Module } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';

/**
 * PrismaService is a global module (per Agent 1's apps/api bootstrap), so it
 * doesn't need to be imported here — just injected.
 */
@Module({
  providers: [AiProviderService],
  exports: [AiProviderService],
})
export class AiProviderModule {}

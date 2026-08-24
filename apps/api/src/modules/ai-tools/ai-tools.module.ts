import { Module } from '@nestjs/common';
import { AiToolsService } from './ai-tools.service';

@Module({
  providers: [AiToolsService],
  exports: [AiToolsService],
})
export class AiToolsModule {}

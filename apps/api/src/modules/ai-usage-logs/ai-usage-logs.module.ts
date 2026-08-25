import { Module } from '@nestjs/common';
import { AiUsageLogsService } from './ai-usage-logs.service';
import { AiUsageLogsController } from './ai-usage-logs.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiUsageLogsController],
  providers: [AiUsageLogsService],
  exports: [AiUsageLogsService],
})
export class AiUsageLogsModule {}

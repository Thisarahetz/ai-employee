import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { PolicySynthesisService } from './policy-synthesis.service';
import { PolicySynthesisController } from './policy-synthesis.controller';

@Module({
  imports: [PrismaModule, AiProviderModule],
  controllers: [PolicySynthesisController],
  providers: [PolicySynthesisService],
  exports: [PolicySynthesisService],
})
export class PolicySynthesisModule {}

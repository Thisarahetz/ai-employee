import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiWorkforceModule } from '../ai-workforce/ai-workforce.module';
import { ReplyEngineController } from './reply-engine.controller';
import { ReplyPolicyService } from './reply-policy.service';
import { SavedAnswerService } from './saved-answer.service';

@Module({
  imports: [PrismaModule, AiWorkforceModule],
  controllers: [ReplyEngineController],
  providers: [ReplyPolicyService, SavedAnswerService],
  exports: [ReplyPolicyService, SavedAnswerService],
})
export class ReplyEngineModule {}

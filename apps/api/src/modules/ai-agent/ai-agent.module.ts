import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { AiToolsModule } from '../ai-tools/ai-tools.module';
import { RagModule } from '../rag/rag.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ExternalActionModule } from '../external-action/external-action.module';
import { HumanHandoffModule } from '../human-handoff/human-handoff.module';
import { MessageModule } from '../message/message.module';
import { RouterAgentService } from './router-agent.service';
import { SupportAgentService } from './support-agent.service';
import { KnowledgeAgentService } from './knowledge-agent.service';
import { ActionAgentService } from './action-agent.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AiAgentConfigService } from './ai-agent-config.service';
import { AiAgentController } from './ai-agent.controller';

import { TimeContextService } from './time-context.service';
import { ToolOutputCompressorService } from './tool-output-compressor.service';

import { DynamicSagaModule } from '../saga/dynamic-saga.module';
import { PolicySynthesisModule } from '../policy-synthesis/policy-synthesis.module';
import { ReplyEngineModule } from '../reply-engine/reply-engine.module';
import { NluModule } from '../nlu/nlu.module';

@Module({
  imports: [
    PrismaModule,
    AiProviderModule,
    AiToolsModule,
    RagModule,
    ConversationModule,
    ExternalActionModule,
    HumanHandoffModule,
    MessageModule,
    DynamicSagaModule,
    PolicySynthesisModule,
    ReplyEngineModule,
    NluModule,
  ],
  controllers: [AiAgentController],
  providers: [
    RouterAgentService,
    SupportAgentService,
    KnowledgeAgentService,
    ActionAgentService,
    AgentOrchestratorService,
    AiAgentConfigService,
    TimeContextService,
    ToolOutputCompressorService,
  ],
  exports: [
    RouterAgentService,
    SupportAgentService,
    KnowledgeAgentService,
    ActionAgentService,
    AiAgentConfigService,
    TimeContextService,
    ToolOutputCompressorService,
  ],
})
export class AiAgentModule {}

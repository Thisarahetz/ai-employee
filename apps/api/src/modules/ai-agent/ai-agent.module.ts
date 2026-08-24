import { Module } from '@nestjs/common';
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

/**
 * Wires up the full multi-agent pipeline. AgentOrchestratorService is
 * registered as a provider (not exported — nothing needs to inject it
 * directly) purely so its @OnEvent(MESSAGE_RECEIVED) listener is
 * instantiated and active app-wide once this module is imported into
 * AppModule.
 *
 * Assumes ConversationModule, ExternalActionModule, HumanHandoffModule and
 * MessageModule each export the service named in the ownership doc
 * (ConversationModule -> ResponseService, ExternalActionModule ->
 * ExternalActionService, HumanHandoffModule -> HumanHandoffService,
 * MessageModule -> MessageService) and live at these conventional paths —
 * built by Agent 1 / Agent 3 in parallel. If any of those module/file names
 * differ, only the import paths here need to change.
 */
@Module({
  imports: [
    AiProviderModule,
    AiToolsModule,
    RagModule,
    ConversationModule,
    ExternalActionModule,
    HumanHandoffModule,
    MessageModule,
  ],
  providers: [
    RouterAgentService,
    SupportAgentService,
    KnowledgeAgentService,
    ActionAgentService,
    AgentOrchestratorService,
  ],
  exports: [RouterAgentService, SupportAgentService, KnowledgeAgentService, ActionAgentService],
})
export class AiAgentModule {}

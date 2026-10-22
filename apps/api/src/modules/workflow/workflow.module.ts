import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowEventListenerService } from './workflow-event-listener.service';
import { N8nModule } from '../n8n/n8n.module';
import { SetupCheckService } from '../ai-workforce/setup-check.service';

@Module({
  imports: [N8nModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowEventListenerService, SetupCheckService],
  exports: [WorkflowService],
})
export class WorkflowModule {}

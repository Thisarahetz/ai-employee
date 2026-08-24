import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowEventListenerService } from './workflow-event-listener.service';
import { N8nModule } from '../n8n/n8n.module';

@Module({
  imports: [N8nModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowEventListenerService],
  exports: [WorkflowService],
})
export class WorkflowModule {}

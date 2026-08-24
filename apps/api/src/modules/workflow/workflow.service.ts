import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateWorkflowDto) {
    return this.prisma.workflow.create({
      data: {
        tenantId,
        name: dto.name,
        n8nWorkflowId: dto.n8nWorkflowId,
        triggerEventType: dto.triggerEventType,
        businessId: dto.businessId,
        description: dto.description,
        isEnabled: dto.isEnabled ?? true,
      },
    });
  }

  findAll(tenantId: string) {
    return this.prisma.workflow.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(tenantId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({ where: { id, tenantId } });
    if (!workflow) throw new NotFoundException(`Workflow ${id} not found`);
    return workflow;
  }

  async update(tenantId: string, id: string, dto: UpdateWorkflowDto) {
    await this.findOne(tenantId, id);
    return this.prisma.workflow.update({ where: { id }, data: { ...dto } });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.workflow.delete({ where: { id } });
    return { success: true };
  }

  /** Used by WorkflowEventListenerService to find which workflows react to an event. */
  findEnabledByTriggerEvent(tenantId: string, triggerEventType: string) {
    return this.prisma.workflow.findMany({ where: { tenantId, triggerEventType, isEnabled: true } });
  }

  async listExecutions(tenantId: string, workflowId: string) {
    await this.findOne(tenantId, workflowId);
    return this.prisma.workflowExecution.findMany({
      where: { tenantId, workflowId },
      orderBy: { startedAt: 'desc' },
    });
  }
}

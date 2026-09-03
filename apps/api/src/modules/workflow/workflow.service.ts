import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { ImportTemplateDto } from './dto/import-template.dto';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

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

  /**
   * Retrieves list of available workflow templates from catalog.
   */
  getTemplates() {
    const candidatePaths = [
      path.resolve(process.cwd(), '../../n8n/templates/catalog.json'),
      path.resolve(process.cwd(), 'n8n/templates/catalog.json'),
      path.resolve(__dirname, '../../../../../n8n/templates/catalog.json'),
      path.resolve(__dirname, '../../../../n8n/templates/catalog.json'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch (e) {
          this.logger.error(`Error parsing template catalog at ${p}: ${e}`);
        }
      }
    }
    return [];
  }

  /**
   * Imports a workflow template for the tenant, registers & activates it in n8n,
   * and creates/links the database Workflow record.
   */
  async importTemplate(tenantId: string, templateId: string, dto: ImportTemplateDto) {
    const templates = this.getTemplates();
    const template = templates.find((t: any) => t.id === templateId);
    if (!template) {
      throw new NotFoundException(`Template with ID "${templateId}" not found in template catalog.`);
    }

    const candidateWorkflowPaths = [
      path.resolve(process.cwd(), '../../n8n/workflows', template.file),
      path.resolve(process.cwd(), 'n8n/workflows', template.file),
      path.resolve(__dirname, '../../../../../n8n/workflows', template.file),
      path.resolve(__dirname, '../../../../n8n/workflows', template.file),
    ];

    let workflowContent: any = null;
    for (const p of candidateWorkflowPaths) {
      if (fs.existsSync(p)) {
        try {
          workflowContent = JSON.parse(fs.readFileSync(p, 'utf-8'));
          break;
        } catch (e) {
          this.logger.error(`Error parsing workflow file at ${p}: ${e}`);
        }
      }
    }

    if (!workflowContent) {
      throw new BadRequestException(`Workflow file "${template.file}" could not be read.`);
    }

    const n8nApiUrl = (process.env.N8N_API_URL || 'http://localhost:5678/api/v1').replace(/\/+$/, '');
    const n8nApiKey = process.env.N8N_API_KEY || '';

    let n8nWorkflowId = template.webhookId;

    // Provision or update in n8n
    if (n8nApiKey) {
      try {
        const listRes = await axios.get(`${n8nApiUrl}/workflows`, {
          headers: { 'X-N8N-API-KEY': n8nApiKey },
          timeout: 5000,
        });
        const existing = (listRes.data?.data || []).find((w: any) => w.name === workflowContent.name);

        if (existing) {
          await axios.put(
            `${n8nApiUrl}/workflows/${existing.id}`,
            {
              name: dto.name || workflowContent.name,
              nodes: workflowContent.nodes,
              connections: workflowContent.connections,
              settings: workflowContent.settings || {},
            },
            { headers: { 'X-N8N-API-KEY': n8nApiKey }, timeout: 5000 },
          );
          await axios
            .post(`${n8nApiUrl}/workflows/${existing.id}/activate`, {}, { headers: { 'X-N8N-API-KEY': n8nApiKey } })
            .catch(() => {});
        } else {
          const createRes = await axios.post(
            `${n8nApiUrl}/workflows`,
            {
              name: dto.name || workflowContent.name,
              nodes: workflowContent.nodes,
              connections: workflowContent.connections,
              settings: workflowContent.settings || {},
            },
            { headers: { 'X-N8N-API-KEY': n8nApiKey }, timeout: 5000 },
          );
          const createdId = createRes.data?.data?.id || createRes.data?.id;
          if (createdId) {
            await axios
              .post(`${n8nApiUrl}/workflows/${createdId}/activate`, {}, { headers: { 'X-N8N-API-KEY': n8nApiKey } })
              .catch(() => {});
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not sync to n8n directly: ${err.message}. Saving database record.`);
      }
    }

    // Upsert database record
    const existingDb = await this.prisma.workflow.findFirst({
      where: {
        tenantId,
        n8nWorkflowId,
      },
    });

    if (existingDb) {
      return this.prisma.workflow.update({
        where: { id: existingDb.id },
        data: {
          name: dto.name || template.name,
          description: template.description,
          triggerEventType: template.triggerEventType,
          businessId: dto.businessId,
          isEnabled: dto.isEnabled ?? true,
        },
      });
    }

    return this.prisma.workflow.create({
      data: {
        tenantId,
        name: dto.name || template.name,
        n8nWorkflowId,
        triggerEventType: template.triggerEventType,
        description: template.description,
        businessId: dto.businessId,
        isEnabled: dto.isEnabled ?? true,
      },
    });
  }
}

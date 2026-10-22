import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { WorkforceCommandService } from './workforce-command.service';
import { TaskControlAction, WorkforceTaskService } from './workforce-task.service';
import { WorkforceApprovalService } from './workforce-approval.service';
import { WorkforceAccessService } from './workforce-access.service';

const CONTROL_ACTIONS: TaskControlAction[] = ['PAUSE', 'RESUME', 'CANCEL', 'PRIORITIZE', 'REASSIGN'];

/**
 * AI Workforce API: owner command chat, task monitor/control, approval
 * decisions and per-employee tool access. Token permissions gate each
 * route; approve/manage/command are additionally re-checked live in the
 * services so revoked access takes effect immediately.
 */
@Controller('ai-workforce')
export class AiWorkforceController {
  constructor(
    private readonly commands: WorkforceCommandService,
    private readonly tasks: WorkforceTaskService,
    private readonly approvals: WorkforceApprovalService,
    private readonly access: WorkforceAccessService,
  ) {}

  // ── Command chat ────────────────────────────────────────────────────────

  @Get('threads')
  @RequirePermissions('ai_employees:command')
  listThreads(@CurrentTenant() t: TenantContext) {
    return this.commands.listThreads(t.tenantId, t.userId);
  }

  @Post('threads')
  @RequirePermissions('ai_employees:command')
  createThread(@CurrentTenant() t: TenantContext, @Body() body: { title?: string }) {
    return this.commands.createThread(t.tenantId, t.userId, body?.title);
  }

  @Get('threads/:id')
  @RequirePermissions('ai_employees:command')
  getThread(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    return this.commands.getThread(t.tenantId, t.userId, id);
  }

  @Delete('threads/:id')
  @RequirePermissions('ai_employees:command')
  deleteThread(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    return this.commands.deleteThread(t.tenantId, t.userId, id);
  }

  /** Send a command. Omit threadId to start a new conversation. */
  @Post('commands')
  @RequirePermissions('ai_employees:command')
  sendCommand(@CurrentTenant() t: TenantContext, @Body() body: { text: string; threadId?: string }) {
    return this.commands.sendCommand(t.tenantId, t.userId, { text: body?.text, threadId: body?.threadId });
  }

  // ── Tasks ───────────────────────────────────────────────────────────────

  @Get('tasks')
  @RequirePermissions('ai_employees:read')
  listTasks(
    @CurrentTenant() t: TenantContext,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tasks.list(t.tenantId, { status, employeeId, q, limit: limit ? parseInt(limit, 10) || undefined : undefined });
  }

  @Get('tasks/:id')
  @RequirePermissions('ai_employees:read')
  getTask(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    return this.tasks.get(t.tenantId, id);
  }

  @Post('tasks')
  @RequirePermissions('ai_employees:command')
  createTask(
    @CurrentTenant() t: TenantContext,
    @Body()
    body: {
      employeeIds: string[];
      title: string;
      description?: string;
      goal?: string;
      priority?: string;
      deadline?: string;
      contextTaskIds?: string[];
      confidential?: boolean;
    },
  ) {
    return this.tasks.createTasks(t.tenantId, t.userId, { ...body, kind: 'TASK' });
  }

  @Post('tasks/:id/control')
  @RequirePermissions('ai_employees:command')
  controlTask(
    @CurrentTenant() t: TenantContext,
    @Param('id') id: string,
    @Body() body: { action: TaskControlAction; employeeId?: string; note?: string },
  ) {
    const action = String(body?.action ?? '').toUpperCase() as TaskControlAction;
    if (!CONTROL_ACTIONS.includes(action)) {
      throw new BadRequestException(`action must be one of ${CONTROL_ACTIONS.join(', ')}`);
    }
    return this.tasks.control(t.tenantId, t.userId, id, action, { employeeId: body.employeeId, note: body.note });
  }

  @Patch('tasks/:id')
  @RequirePermissions('ai_employees:command')
  updateTask(
    @CurrentTenant() t: TenantContext,
    @Param('id') id: string,
    @Body() body: { priority?: string; deadline?: string | null; title?: string; description?: string; goal?: string | null },
  ) {
    return this.tasks.updateDetails(t.tenantId, t.userId, id, body ?? {});
  }

  // ── Approvals ───────────────────────────────────────────────────────────

  @Post('approvals/:id/decide')
  @RequirePermissions('ai_employees:approve')
  decide(
    @CurrentTenant() t: TenantContext,
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  ) {
    return this.approvals.decide(t.tenantId, t.userId, id, body?.decision, body?.reviewNotes);
  }

  // ── Tool access ─────────────────────────────────────────────────────────

  @Get('employees/:id/tools')
  @RequirePermissions('ai_employees:read')
  getTools(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    return this.access.getToolAccess(t.tenantId, id);
  }

  @Put('employees/:id/tools')
  @RequirePermissions('ai_employees:manage')
  setTools(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body() body: { grants: string[] }) {
    return this.access.setToolAccess(t.tenantId, t.userId, id, body?.grants);
  }
}

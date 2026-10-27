import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { SavedAnswerService } from './saved-answer.service';
import { ReplyPolicyService } from './reply-policy.service';

/** Saved answers (replies without AI) and the business's reply mode. */
@Controller()
export class ReplyEngineController {
  constructor(
    private readonly savedAnswers: SavedAnswerService,
    private readonly policy: ReplyPolicyService,
  ) {}

  @RequirePermissions('conversations:read')
  @Get('saved-answers')
  list(@CurrentTenant() t: TenantContext, @Query('status') status?: string) {
    return this.savedAnswers.list(t.tenantId, status || undefined);
  }

  @RequirePermissions('conversations:read')
  @Get('saved-answers/stats')
  stats(@CurrentTenant() t: TenantContext, @Query('days') days?: string) {
    const n = Number(days);
    return this.savedAnswers.stats(t.tenantId, Number.isFinite(n) && n > 0 ? Math.floor(n) : 30);
  }

  @RequirePermissions('conversations:read')
  @Post('saved-answers/test')
  test(@CurrentTenant() t: TenantContext, @Body() body: { message?: unknown; language?: unknown }) {
    return this.savedAnswers.test(t.tenantId, body?.message, body?.language);
  }

  @RequirePermissions('ai:configure')
  @Post('saved-answers')
  create(@CurrentTenant() t: TenantContext, @Body() body: Record<string, unknown>) {
    return this.savedAnswers.create(t.tenantId, t.userId, body ?? {});
  }

  @RequirePermissions('ai:configure')
  @Patch('saved-answers/:id')
  update(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.savedAnswers.update(t.tenantId, id, body ?? {});
  }

  @RequirePermissions('ai:configure')
  @Delete('saved-answers/:id')
  remove(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    return this.savedAnswers.remove(t.tenantId, id);
  }

  @RequirePermissions('tenant:read')
  @Get('reply-settings')
  settings(@CurrentTenant() t: TenantContext) {
    return this.policy.getSettings(t.tenantId);
  }

  @RequirePermissions('ai:configure')
  @Patch('reply-settings')
  async setMode(@CurrentTenant() t: TenantContext, @Body() body: { mode?: unknown; smartRouting?: unknown }) {
    if (body?.mode === undefined && body?.smartRouting === undefined) throw new BadRequestException('Nothing to change.');
    if (body.smartRouting !== undefined) await this.policy.setSmartRouting(t.tenantId, body.smartRouting);
    return body.mode !== undefined ? this.policy.setMode(t.tenantId, body.mode) : this.policy.getSettings(t.tenantId);
  }
}

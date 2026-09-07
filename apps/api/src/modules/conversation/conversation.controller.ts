import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ConversationService } from './conversation.service';
import { ResponseService } from './response.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly responseService: ResponseService,
  ) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListConversationsQueryDto) {
    return this.conversationService.list(tenant.tenantId, query, tenant);
  }

  @Get(':id')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.conversationService.get(tenant.tenantId, id, tenant);
  }

  @RequirePermissions('conversations:takeover')
  @Post(':id/take-control')
  takeControl(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.conversationService.takeControl(tenant.tenantId, id, tenant.userId);
  }

  @RequirePermissions('conversations:takeover')
  @Post(':id/return-to-ai')
  returnToAi(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.conversationService.returnToAi(tenant.tenantId, id);
  }

  @RequirePermissions('messages:write')
  @Post(':id/messages')
  async sendMessage(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const conversation = await this.conversationService.get(tenant.tenantId, id);
    if (conversation.status !== 'HUMAN_HANDLING') {
      await this.conversationService.takeControl(tenant.tenantId, id, tenant.userId);
    }
    return this.responseService.sendResponse({
      tenantId: tenant.tenantId,
      conversationId: id,
      content: dto.content,
      agentType: AgentType.HUMAN,
    });
  }
}

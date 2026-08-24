import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ConversationService } from './conversation.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListConversationsQueryDto) {
    return this.conversationService.list(tenant.tenantId, query);
  }

  @Get(':id')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.conversationService.get(tenant.tenantId, id);
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
}

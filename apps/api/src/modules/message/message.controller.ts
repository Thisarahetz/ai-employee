import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { MessageService } from './message.service';

@Controller('conversations/:conversationId/messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messageService.list(tenant.tenantId, conversationId, query.page, query.pageSize);
  }
}

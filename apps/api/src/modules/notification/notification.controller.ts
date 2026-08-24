import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.notificationService.list(tenant.tenantId, tenant.userId);
  }

  @Post(':id/read')
  markRead(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.notificationService.markRead(tenant.tenantId, tenant.userId, id);
  }
}

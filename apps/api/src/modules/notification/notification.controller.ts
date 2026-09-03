import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Public()
  @Post('email')
  sendEmail(@Body() body: { to: string; subject: string; text?: string; html?: string; tenantId?: string }) {
    return this.notificationService.sendEmail(body);
  }

  @Public()
  @Post('slack')
  sendSlack(@Body() body: { text: string; blocks?: any; tenantId?: string }) {
    return this.notificationService.sendSlack(body);
  }

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.notificationService.list(tenant.tenantId, tenant.userId);
  }

  @Post(':id/read')
  markRead(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.notificationService.markRead(tenant.tenantId, tenant.userId, id);
  }
}

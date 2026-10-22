import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../../common/guards/service-token.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** Internal only (n8n): requires the `x-service-token` header. */
  @Public()
  @UseGuards(ServiceTokenGuard)
  @Post('email')
  sendEmail(@Body() body: { to: string; subject: string; text?: string; html?: string; tenantId?: string }) {
    return this.notificationService.sendEmail(body);
  }

  /** Internal only (n8n): requires the `x-service-token` header. */
  @Public()
  @UseGuards(ServiceTokenGuard)
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

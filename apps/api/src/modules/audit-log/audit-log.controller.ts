import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @RequirePermissions('audit_logs:read')
  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListAuditLogsQueryDto) {
    return this.auditLogService.list(tenant.tenantId, query.entityType);
  }
}

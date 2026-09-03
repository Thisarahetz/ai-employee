import { Controller, Get, Query, Logger } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

@Controller('crm')
export class CrmMockController {
  private readonly logger = new Logger(CrmMockController.name);

  @Public()
  @Get('leads')
  getLeads(@Query() query: Record<string, any>) {
    this.logger.log(`CRM mock leads lookup: ${JSON.stringify(query)}`);
    return {
      success: true,
      data: [
        {
          id: query.customerId ? `crm_lead_${query.customerId}` : 'crm_lead_1',
          customerId: query.customerId || 'cust_1',
          tenantId: query.tenantId || 'tenant_1',
          status: 'ACTIVE',
        },
      ],
    };
  }
}

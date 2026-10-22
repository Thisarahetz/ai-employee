import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { ProviderKeysService } from './provider-keys.service';

/** A business's own AI provider keys. Keys are write-only: responses show only the last 4 characters. */
@Controller('ai-config/provider-keys')
export class AiProviderController {
  constructor(private readonly keys: ProviderKeysService) {}

  @Get()
  @RequirePermissions('ai:configure')
  list(@CurrentTenant() t: TenantContext) {
    return this.keys.list(t.tenantId);
  }

  @Put(':provider')
  @RequirePermissions('ai:configure')
  set(@CurrentTenant() t: TenantContext, @Param('provider') provider: string, @Body() body: { apiKey: string; validate?: boolean }) {
    return this.keys.set(t.tenantId, t.userId, provider, body?.apiKey, { validate: body?.validate });
  }

  @Delete(':provider')
  @RequirePermissions('ai:configure')
  remove(@CurrentTenant() t: TenantContext, @Param('provider') provider: string) {
    return this.keys.remove(t.tenantId, t.userId, provider);
  }
}

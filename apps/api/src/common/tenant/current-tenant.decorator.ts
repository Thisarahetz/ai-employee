import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from './tenant-context';

/**
 * Reads `request.tenantContext` (populated by `TenantMiddleware`).
 * Usage: `@CurrentTenant() tenant: TenantContext`.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { tenantContext?: TenantContext }>();
    return request.tenantContext as TenantContext;
  },
);

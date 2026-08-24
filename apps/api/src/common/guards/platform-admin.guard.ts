import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '../tenant/tenant-context';

/**
 * Gates the cross-tenant /admin/* API. Deliberately separate from RolesGuard
 * (which only ever checks permissions *within* the caller's own tenant) —
 * `platformRole` is not a tenant role and is not settable via signup or any
 * tenant-scoped endpoint. See User.platformRole in schema.prisma.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { tenantContext?: TenantContext }>();

    if (!request.tenantContext || request.tenantContext.platformRole === 'NONE') {
      throw new ForbiddenException('Platform admin access required');
    }

    return true;
  }
}

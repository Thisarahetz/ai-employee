import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';

/**
 * Gates the cross-tenant /admin/* API. Deliberately separate from RolesGuard
 * (which only ever checks permissions *within* the caller's own tenant) —
 * `platformRole` is not a tenant role and is not settable via signup or any
 * tenant-scoped endpoint. See User.platformRole in schema.prisma.
 *
 * Two-stage check:
 *   1. A cheap claim check on the access token — rejects every normal tenant
 *      user with zero DB round-trips.
 *   2. A live DB re-check of `platformRole` + `status`. Access tokens live for
 *      ~15 min; without this, revoking someone's platform access (or disabling
 *      their account) in the /admin console would only take effect once their
 *      current token expired. The console is high-blast-radius enough that
 *      "revocation is eventual" isn't acceptable, so we pay one indexed
 *      lookup per /admin request to make it immediate.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { tenantContext?: TenantContext }>();

    const ctx = request.tenantContext;
    if (!ctx || ctx.platformRole === 'NONE') {
      throw new ForbiddenException('Platform admin access required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { platformRole: true, status: true },
    });

    if (!user || user.platformRole !== 'SUPER_ADMIN' || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Platform admin access required');
    }

    return true;
  }
}

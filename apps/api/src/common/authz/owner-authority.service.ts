import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type AiAuthority = 'ai_employees:command' | 'ai_employees:manage' | 'ai_employees:approve';

/** Roles that hold every AI-employee authority by default. */
const PRIVILEGED_ROLES = new Set(['OWNER', 'ADMIN']);
/** MANAGER may command AI employees but not approve actions or change their access. */
const MANAGER_AUTHORITIES = new Set<AiAuthority>(['ai_employees:command']);

/**
 * Live, database-backed check of a user's authority over the tenant's AI
 * workforce. Access-token claims live ~15 minutes, so revoking someone (or
 * disabling their membership) would otherwise take effect only when the
 * token expires. Sensitive operations (approving an action, changing an AI
 * employee's tools or permissions) call this on every request.
 *
 * Custom per-member permission lists (TenantMembership.permissions) replace
 * the role defaults, the same way AuthService.issueTokens resolves them.
 */
@Injectable()
export class OwnerAuthorityService {
  constructor(private readonly prisma: PrismaService) {}

  async hasAuthority(tenantId: string, userId: string, authority: AiAuthority): Promise<boolean> {
    if (!tenantId || !userId) return false;

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, userId },
      select: { role: true, status: true, permissions: true, user: { select: { status: true } } },
    });

    if (!membership || membership.status !== 'ACTIVE') return false;
    if (membership.user && membership.user.status !== 'ACTIVE') return false;

    const custom = membership.permissions ?? [];
    if (custom.length > 0) {
      return custom.includes('*') || custom.includes(authority);
    }

    if (PRIVILEGED_ROLES.has(membership.role)) return true;
    if (membership.role === 'MANAGER') return MANAGER_AUTHORITIES.has(authority);
    return false;
  }

  async assert(tenantId: string, userId: string, authority: AiAuthority): Promise<void> {
    if (!(await this.hasAuthority(tenantId, userId, authority))) {
      throw new ForbiddenException(`Your account does not have the "${authority}" authority for this business.`);
    }
  }
}

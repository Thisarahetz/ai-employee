import { randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateTenantDto } from '../tenant/dto/update-tenant.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';

const PLATFORM_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  platformRole: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { memberships: true } },
} as const;

/**
 * The one deliberate, guard-gated exception to "never allow one tenant to
 * access another tenant's data": every query here is intentionally
 * cross-tenant. Only reachable behind PlatformAdminGuard.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /**
   * A platform admin onboarding a tenant on someone's behalf (as opposed to
   * the tenant's own owner self-registering via POST /auth/signup). Reuses
   * the same Tenant+Business+owner-membership bootstrap as signup, but with
   * `allowExistingUser: true` — a trusted admin action, unlike public
   * signup, so it's safe to attach the new tenant to an already-registered
   * email (e.g. a person who owns a second business) without a password
   * check. Never logs the admin in as the new tenant — no tokens returned,
   * just the created tenant and (only for a brand-new identity) a
   * one-time-visible temporary password for the owner.
   */
  async createTenant(dto: CreateTenantDto) {
    // Generated eagerly in case the email turns out to be new — ignored by
    // createTenantWithOwner when it finds (and reuses) an existing identity.
    const ownerPassword = dto.ownerPassword ?? randomBytes(9).toString('base64url');

    const { user, tenant, createdNewUser } = await this.authService.createTenantWithOwner({
      tenantName: dto.tenantName,
      tenantSlug: dto.tenantSlug,
      ownerEmail: dto.ownerEmail,
      ownerPassword,
      ownerFirstName: dto.ownerFirstName,
      ownerLastName: dto.ownerLastName,
      allowExistingUser: true,
    });

    return {
      tenant,
      owner: { id: user.id, email: user.email },
      createdNewUser,
      // Only ever returned here, once — not stored in plaintext anywhere.
      // Meaningless (and omitted) when reusing an existing identity, or when
      // the admin supplied their own password.
      temporaryPassword: createdNewUser && !dto.ownerPassword ? ownerPassword : undefined,
    };
  }

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { memberships: true, conversations: true, integrations: true },
        },
      },
    });

    return tenants.map(({ _count, ...tenant }) => ({
      ...tenant,
      userCount: _count.memberships,
      conversationCount: _count.conversations,
      integrationCount: _count.integrations,
    }));
  }

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async listTenantUsers(tenantId: string) {
    await this.getTenant(tenantId);
    return this.prisma.tenantMembership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, status: true, lastLoginAt: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** General tenant management: name, plan, and/or status in one call. */
  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    await this.getTenant(tenantId);
    return this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
  }

  /** Platform-wide user list — every global identity, not scoped to a tenant. */
  async listUsers() {
    const users = await this.prisma.user.findMany({
      select: PLATFORM_USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ _count, ...user }) => ({ ...user, membershipCount: _count.memberships }));
  }
}

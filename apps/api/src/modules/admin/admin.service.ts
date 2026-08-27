import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationSkip, toPaginatedResponse, toPaginationRequest } from '@ai-employee/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateTenantDto } from '../tenant/dto/update-tenant.dto';
import { AdminListQueryDto } from './dto/admin-list-query.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

/** Who performed an /admin mutation — threaded through for the audit trail. */
export interface AdminActor {
  userId: string;
  ipAddress?: string;
}

/**
 * The one deliberate, guard-gated exception to "never allow one tenant to
 * access another tenant's data": every query here is intentionally
 * cross-tenant. Only reachable behind PlatformAdminGuard.
 *
 * Every mutation writes a PlatformAuditLog row (see recordAudit) — the /admin
 * console is high-blast-radius and its actions need to be attributable after
 * the fact.
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
  async createTenant(dto: CreateTenantDto, actor: AdminActor) {
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

    await this.recordAudit(actor, 'tenant.create', 'tenant', tenant.id, {
      name: tenant.name,
      slug: tenant.slug,
      ownerEmail: user.email,
      createdNewUser,
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

  async listTenants(query: AdminListQueryDto) {
    const pagination = toPaginationRequest({ page: query.page, pageSize: query.pageSize });
    const search = query.search?.trim();
    const where: Prisma.TenantWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(pagination),
        take: pagination.pageSize,
        include: { _count: { select: { memberships: true } } },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const data = tenants.map(({ _count, ...tenant }) => ({
      ...tenant,
      userCount: _count.memberships,
    }));
    return toPaginatedResponse(data, total, pagination);
  }

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const { _count, ...rest } = tenant;
    return { ...rest, userCount: _count.memberships };
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
  async updateTenant(tenantId: string, dto: UpdateTenantDto, actor: AdminActor) {
    const before = await this.getTenant(tenantId);
    const updated = await this.prisma.tenant.update({ where: { id: tenantId }, data: dto });

    const action =
      dto.status && dto.status !== before.status
        ? dto.status === 'SUSPENDED'
          ? 'tenant.suspend'
          : 'tenant.activate'
        : 'tenant.update';

    await this.recordAudit(actor, action, 'tenant', tenantId, {
      before: { name: before.name, plan: before.plan, status: before.status },
      after: { name: updated.name, plan: updated.plan, status: updated.status },
    });

    return updated;
  }

  /** Platform-wide user list — every global identity, not scoped to a tenant. */
  async listUsers(query: AdminListQueryDto) {
    const pagination = toPaginationRequest({ page: query.page, pageSize: query.pageSize });
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: PLATFORM_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(pagination),
        take: pagination.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = users.map(({ _count, ...user }) => ({ ...user, membershipCount: _count.memberships }));
    return toPaginatedResponse(data, total, pagination);
  }

  /** One global identity, with every tenant they belong to. */
  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...PLATFORM_USER_SELECT,
        updatedAt: true,
        memberships: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            tenant: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { _count, ...rest } = user;
    return { ...rest, membershipCount: _count.memberships };
  }

  /**
   * Grant/revoke platform (super-admin) access and/or enable/disable an
   * account, platform-wide. Guardrails:
   *   - You can't disable your own account (self-lockout prevention).
   *   - The last active super admin can't be demoted or disabled — by anyone,
   *     including themselves — so the /admin console can never be locked out
   *     (mirrors UserService.guardLastOwner for tenants).
   *   - Disabling clears the refresh token, so existing sessions can't be
   *     silently extended past the current access token's ~15-min life.
   */
  async updateUser(userId: string, dto: UpdateUserDto, actor: AdminActor) {
    if (dto.platformRole === undefined && dto.status === undefined) {
      throw new BadRequestException('Nothing to update — provide platformRole and/or status');
    }
    if (userId === actor.userId && dto.status === 'DISABLED') {
      throw new BadRequestException('You cannot disable your own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, platformRole: true, status: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isActiveSuperAdmin = user.platformRole === 'SUPER_ADMIN' && user.status === 'ACTIVE';
    const losesAccess = dto.platformRole === 'NONE' || dto.status === 'DISABLED';

    if (isActiveSuperAdmin && losesAccess) {
      const activeSuperAdmins = await this.prisma.user.count({
        where: { platformRole: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      if (activeSuperAdmins <= 1) {
        throw new BadRequestException(
          'This is the last active super admin — promote another account first',
        );
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.platformRole !== undefined) data.platformRole = dto.platformRole;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'DISABLED') data.refreshTokenHash = null;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: PLATFORM_USER_SELECT,
    });

    for (const action of this.resolveUserAuditActions(user, dto)) {
      await this.recordAudit(actor, action, 'user', userId, {
        email: user.email,
        before: { platformRole: user.platformRole, status: user.status },
        after: { platformRole: updated.platformRole, status: updated.status },
      });
    }

    const { _count, ...rest } = updated;
    return { ...rest, membershipCount: _count.memberships };
  }

  /** Recent platform-admin actions, optionally scoped to one entity. */
  async listAuditLog(query: { targetType?: string; targetId?: string; page?: number; pageSize?: number }) {
    const pagination = toPaginationRequest({ page: query.page, pageSize: query.pageSize });
    const where: Prisma.PlatformAuditLogWhereInput = {};
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = query.targetId;

    const [entries, total] = await Promise.all([
      this.prisma.platformAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(pagination),
        take: pagination.pageSize,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.platformAuditLog.count({ where }),
    ]);

    return toPaginatedResponse(entries, total, pagination);
  }

  private resolveUserAuditActions(
    before: { platformRole: string; status: string },
    dto: UpdateUserDto,
  ): string[] {
    const actions: string[] = [];
    if (dto.platformRole !== undefined && dto.platformRole !== before.platformRole) {
      actions.push(dto.platformRole === 'SUPER_ADMIN' ? 'user.grant_super_admin' : 'user.revoke_super_admin');
    }
    if (dto.status !== undefined && dto.status !== before.status) {
      actions.push(dto.status === 'DISABLED' ? 'user.disable' : 'user.enable');
    }
    return actions;
  }

  private recordAudit(
    actor: AdminActor,
    action: string,
    targetType: 'tenant' | 'user',
    targetId: string,
    changes: Record<string, unknown>,
  ) {
    return this.prisma.platformAuditLog.create({
      data: {
        actorUserId: actor.userId,
        action,
        targetType,
        targetId,
        changes: changes as Prisma.InputJsonValue,
        ipAddress: actor.ipAddress ?? null,
      },
    });
  }
}

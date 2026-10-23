import { TaskQueueService } from '../ai-workforce/task-queue.service';
import { platformDefaultLimits } from '../ai-workforce/usage-limits.service';
import { platformDefaultModel } from '../ai-provider/ai-provider.service';
import { platformKeysAllowed } from '../ai-provider/provider-keys.service';
import { BusinessType } from '@prisma/client';
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
    private readonly queue: TaskQueueService,
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

  /** High-level metrics for the platform dashboard overview. */
  async getPlatformStats() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      newTenantsThisMonth,
      totalAiEmployees,
      activeAiEmployees,
      pausedAiEmployees,
      needsAttentionAiEmployees,
      totalUsers,
      activeUsers,
      superAdminUsers,
      totalConversations,
      aiHandlingConversations,
      closedConversations,
      aiUsage,
      recentAudits,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({ where: { status: 'TRIAL' } }),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.tenant.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.aiEmployee.count(),
      this.prisma.aiEmployee.count({ where: { status: 'ACTIVE' } }),
      this.prisma.aiEmployee.count({ where: { status: 'PAUSED' } }),
      this.prisma.aiEmployee.count({ where: { status: 'NEEDS_ATTENTION' } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { platformRole: 'SUPER_ADMIN' } }),
      this.prisma.conversation.count(),
      this.prisma.conversation.count({ where: { status: 'AI_HANDLING' } }),
      this.prisma.conversation.count({ where: { status: 'CLOSED' } }),
      this.prisma.aiUsageLog
        .aggregate({
          _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
        })
        .catch(() => ({ _sum: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 } })),
      this.prisma.platformAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        trial: trialTenants,
        suspended: suspendedTenants,
        newThisMonth: newTenantsThisMonth,
      },
      aiEmployees: {
        total: totalAiEmployees,
        active: activeAiEmployees,
        paused: pausedAiEmployees,
        needsAttention: needsAttentionAiEmployees,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        superAdmins: superAdminUsers,
      },
      conversations: {
        total: totalConversations,
        aiHandling: aiHandlingConversations,
        closed: closedConversations,
      },
      usage: {
        totalTokens: (aiUsage._sum?.inputTokens ?? 0) + (aiUsage._sum?.outputTokens ?? 0),
        estimatedCostUsd: Number(aiUsage._sum?.estimatedCostUsd ?? 0),
      },
      recentAudits,
      systemAlerts:
        needsAttentionAiEmployees > 0
          ? [`${needsAttentionAiEmployees} AI Employee(s) require operational attention.`]
          : [],
    };
  }

  async listTenants(query: AdminListQueryDto) {
    const pagination = toPaginationRequest({ page: query.page, pageSize: query.pageSize });
    const search = query.search?.trim();
    const where: Prisma.TenantWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { memberships: { some: { user: { email: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as any;
    }

    if (query.plan && query.plan !== 'ALL') {
      where.plan = { equals: query.plan, mode: 'insensitive' };
    }

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(pagination),
        take: pagination.pageSize,
        include: {
          _count: { select: { memberships: true, businesses: true, aiEmployees: true } },
          memberships: {
            where: { role: 'OWNER' },
            take: 1,
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          },
          businesses: {
            take: 1,
            select: { type: true },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const data = tenants.map(({ _count, memberships, businesses, ...tenant }) => ({
      ...tenant,
      userCount: _count.memberships,
      branchCount: _count.businesses,
      aiEmployeeCount: _count.aiEmployees,
      owner: memberships[0]?.user || null,
      businessType: businesses[0]?.type || 'CUSTOM',
    }));
    return toPaginatedResponse(data, total, pagination);
  }

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            memberships: true,
            businesses: true,
            aiEmployees: true,
            conversations: true,
            messages: true,
          },
        },
        businesses: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            type: true,
            timezone: true,
            settings: true,
            createdAt: true,
          },
        },
        aiEmployees: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            role: true,
            department: true,
            businessFunction: true,
            description: true,
            avatar: true,
            status: true,
            actionLevel: true,
            scope: true,
            responsibilities: true,
            assignedTasks: true,
            permissions: true,
            stats: true,
            createdAt: true,
            _count: { select: { activities: true, approvals: true } },
          },
        },
        memberships: {
          where: { role: 'OWNER' },
          take: 1,
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const tokenStats = await this.prisma.aiUsageLog
      .aggregate({
        where: { tenantId },
        _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
      })
      .catch(() => ({ _sum: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 } }));

    const { _count, memberships, ...rest } = tenant;
    return {
      ...rest,
      userCount: _count.memberships,
      branchCount: _count.businesses,
      aiEmployeeCount: _count.aiEmployees,
      conversationCount: _count.conversations,
      messageCount: _count.messages,
      owner: memberships[0]?.user || null,
      usage: {
        totalTokens: (tokenStats._sum?.inputTokens ?? 0) + (tokenStats._sum?.outputTokens ?? 0),
        inputTokens: tokenStats._sum?.inputTokens ?? 0,
        outputTokens: tokenStats._sum?.outputTokens ?? 0,
        estimatedCostUsd: Number(tokenStats._sum?.estimatedCostUsd ?? 0),
      },
    };
  }

  async deleteTenant(tenantId: string, actor: AdminActor) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.prisma.tenant.delete({
      where: { id: tenantId },
    });

    await this.recordAudit(actor, 'tenant.delete', 'tenant', tenantId, {
      name: tenant.name,
      slug: tenant.slug,
    });

    return { success: true, message: `Tenant ${tenant.name} (${tenant.slug}) deleted.` };
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

  /** Platform-wide AI employees across all businesses/tenants. */
  async listPlatformAiEmployees(query: AdminListQueryDto) {
    const pagination = toPaginationRequest({ page: query.page, pageSize: query.pageSize });
    const search = query.search?.trim();
    const where: Prisma.AiEmployeeWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { role: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { businessFunction: { contains: search, mode: 'insensitive' } },
        { tenant: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query.actionLevel && query.actionLevel !== 'ALL') {
      where.actionLevel = query.actionLevel;
    }

    const [employees, total] = await Promise.all([
      this.prisma.aiEmployee.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(pagination),
        take: pagination.pageSize,
        include: {
          tenant: { select: { id: true, name: true, slug: true, plan: true, status: true } },
          _count: { select: { activities: true, approvals: true } },
        },
      }),
      this.prisma.aiEmployee.count({ where }),
    ]);

    const data = employees.map(({ _count, ...emp }) => ({
      ...emp,
      activityCount: _count.activities,
      pendingApprovalsCount: _count.approvals,
    }));

    return toPaginatedResponse(data, total, pagination);
  }

  /** Platform admin emergency override: pause or reactivate an AI employee. */
  async updateAiEmployeeStatus(employeeId: string, status: string, actor: AdminActor) {
    const before = await this.prisma.aiEmployee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, status: true, tenantId: true },
    });
    if (!before) throw new NotFoundException('AI Employee not found');

    const updated = await this.prisma.aiEmployee.update({
      where: { id: employeeId },
      data: { status },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    await this.recordAudit(actor, 'ai_employee.update_status', 'tenant', before.tenantId, {
      employeeId,
      employeeName: before.name,
      beforeStatus: before.status,
      afterStatus: status,
    });

    return updated;
  }

  /** Platform industry templates (from the database) with how many businesses use each. */
  async getAiTemplatesCatalog() {
    const [templates, adoption] = await Promise.all([
      this.prisma.industryTemplate.findMany({ where: { tenantId: null }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      this.prisma.business.groupBy({ by: ['industryTemplateKey'], _count: { _all: true } }),
    ]);
    const used = new Map(adoption.map((a) => [a.industryTemplateKey, a._count._all]));
    return templates.map((t) => {
      const employees = ((t.definition as { employees?: unknown[] })?.employees ?? []) as Record<string, unknown>[];
      return {
        id: t.key,
        templateId: t.id,
        name: t.name,
        category: t.category,
        icon: t.icon,
        description: t.description,
        isPublished: t.isPublished,
        suggestedEmployeesCount: employees.length,
        suggestedEmployees: employees,
        adoptionCount: used.get(t.key) ?? 0,
      };
    });
  }

  /** Business types in use, with the platform templates available for each. */
  async getBusinessTypesCatalog() {
    const [counts, templates] = await Promise.all([
      this.prisma.business.groupBy({ by: ['type'], _count: { id: true } }),
      this.prisma.industryTemplate.findMany({ where: { tenantId: null, isPublished: true }, select: { key: true, name: true, businessType: true, category: true } }),
    ]);
    const typeCounts = new Map(counts.map((b) => [b.type, b._count.id]));
    return Object.values(BusinessType).map((type) => {
      const forType = templates.filter((t) => t.businessType === type);
      return {
        id: type,
        name: type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
        categories: [...new Set(forType.map((t) => t.category))],
        defaultTemplates: forType.map((t) => t.key),
        templateNames: forType.map((t) => t.name),
        activeCount: typeCounts.get(type) ?? 0,
      };
    });
  }

  /** SaaS subscription plan tiers and tenant subscription distribution. */
  async getPlatformPlans() {
    const planCounts = await this.prisma.tenant.groupBy({
      by: ['plan'],
      _count: { id: true },
    });
    const countsMap = new Map(planCounts.map((p) => [p.plan.toLowerCase(), p._count.id]));

    const plans = [
      {
        id: 'free',
        name: 'Free Trial',
        badge: 'Trial',
        description: 'For testing AI employees and basic customer inquiries.',
        priceMonthlyUsd: 0,
        limits: {
          maxBranches: 1,
          maxAiEmployees: 2,
          maxTeamMembers: 3,
          messagesPerMonth: 1000,
          knowledgeDocs: 5,
          support: 'Community',
        },
        tenantCount: (countsMap.get('free') ?? 0) + (countsMap.get('trial') ?? 0),
      },
      {
        id: 'starter',
        name: 'Starter',
        badge: 'Popular',
        description: 'Ideal for single-location shops and independent practices.',
        priceMonthlyUsd: 49,
        limits: {
          maxBranches: 1,
          maxAiEmployees: 3,
          maxTeamMembers: 5,
          messagesPerMonth: 5000,
          knowledgeDocs: 20,
          support: 'Standard Email',
        },
        tenantCount: countsMap.get('starter') ?? 0,
      },
      {
        id: 'pro',
        name: 'Professional',
        badge: 'Growth',
        description: 'For growing businesses requiring autonomous AI actions & branches.',
        priceMonthlyUsd: 149,
        limits: {
          maxBranches: 3,
          maxAiEmployees: 8,
          maxTeamMembers: 15,
          messagesPerMonth: 25000,
          knowledgeDocs: 100,
          support: 'Priority 24/7',
        },
        tenantCount: countsMap.get('pro') ?? 0,
      },
      {
        id: 'business',
        name: 'Business Scale',
        badge: 'Scale',
        description: 'Multi-branch companies requiring deep CRM and ERP workflows.',
        priceMonthlyUsd: 399,
        limits: {
          maxBranches: 10,
          maxAiEmployees: 25,
          maxTeamMembers: 50,
          messagesPerMonth: 100000,
          knowledgeDocs: 500,
          support: 'Dedicated SLA',
        },
        tenantCount: countsMap.get('business') ?? 0,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        badge: 'Custom',
        description: 'Custom deployment, dedicated models, and unlimited capacity.',
        priceMonthlyUsd: 999,
        limits: {
          maxBranches: 999,
          maxAiEmployees: 999,
          maxTeamMembers: 999,
          messagesPerMonth: 1000000,
          knowledgeDocs: 5000,
          support: 'Dedicated Account Executive',
        },
        tenantCount: countsMap.get('enterprise') ?? 0,
      },
    ];

    return plans;
  }

  /** Platform-wide usage and consumption statistics. */
  async getPlatformUsage() {
    const [tokensAggregate, totalConversations, totalMessages, activitiesByCategory, topTenantsRaw] =
      await Promise.all([
        this.prisma.aiUsageLog
          .aggregate({
            _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
            _count: { id: true },
          })
          .catch(() => ({ _sum: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }, _count: { id: 0 } })),
        this.prisma.conversation.count(),
        this.prisma.message.count(),
        this.prisma.aiEmployeeActivity.groupBy({
          by: ['category'],
          _count: { id: true },
        }),
        // Busiest tenants by AI cost over the last 30 days (not simply the newest).
        this.prisma.aiUsageLog
          .groupBy({
            by: ['tenantId'],
            where: { createdAt: { gte: new Date(Date.now() - 30 * 86400e3) } },
            _sum: { estimatedCostUsd: true },
            orderBy: { _sum: { estimatedCostUsd: 'desc' } },
            take: 6,
          })
          .then((rows) =>
            this.prisma.tenant
              .findMany({
          where: { id: { in: rows.map((r) => r.tenantId) } },
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
            _count: { select: { conversations: true, messages: true, aiEmployees: true } },
          },
              })
              .then((ts) =>
                rows
                  .map((r) => ({ ...ts.find((t) => t.id === r.tenantId)!, costUsd30d: Number(r._sum.estimatedCostUsd ?? 0) }))
                  .filter((t) => t.id),
              ),
          ),
      ]);

    return {
      tokens: {
        total: (tokensAggregate._sum?.inputTokens ?? 0) + (tokensAggregate._sum?.outputTokens ?? 0),
        inputTokens: tokensAggregate._sum?.inputTokens ?? 0,
        outputTokens: tokensAggregate._sum?.outputTokens ?? 0,
        estimatedCostUsd: Number(tokensAggregate._sum?.estimatedCostUsd ?? 0),
        totalInvocations: tokensAggregate._count?.id ?? 0,
      },
      volumes: {
        conversations: totalConversations,
        messages: totalMessages,
      },
      activitiesByCategory: activitiesByCategory.map((c) => ({
        category: c.category,
        count: c._count.id,
      })),
      topTenants: topTenantsRaw.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        status: t.status,
        conversationsCount: t._count.conversations,
        messagesCount: t._count.messages,
        aiEmployeesCount: t._count.aiEmployees,
        costUsd30d: t.costUsd30d,
      })),
    };
  }

  /** Live system health, round-trip database latency, and service availability. */
  async getSystemHealth() {
    const startTime = Date.now();
    let dbLatencyMs = 0;
    let dbStatus: 'healthy' | 'unhealthy' = 'healthy';

    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = 'unhealthy';
    }

    const memory = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());

    // Actually reach Redis through the task queue instead of trusting an env var.
    const redisStart = Date.now();
    const queueCounts = await this.queue.counts().catch(() => null);
    const redisStatus: 'healthy' | 'unhealthy' = queueCounts ? 'healthy' : 'unhealthy';
    const redisLatencyMs = Date.now() - redisStart;

    const model = platformDefaultModel();
    const provider = (name: string, env: string) => ({
      configured: Boolean(process.env[env]?.trim()),
      status: process.env[env]?.trim() ? 'active' : 'not_configured',
      isPlatformDefault: model.provider === name,
      defaultModel: model.provider === name ? model.model : null,
    });
    const aiProviders = {
      openai: provider('OPENAI', 'OPENAI_API_KEY'),
      anthropic: provider('ANTHROPIC', 'ANTHROPIC_API_KEY'),
      gemini: provider('GEMINI', 'GEMINI_API_KEY'),
    };

    const activeChannels = await this.prisma.channel.count({ where: { status: 'ACTIVE' } });

    return {
      status: dbStatus === 'healthy' && redisStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      diagnosticDurationMs: Date.now() - startTime,
      services: {
        api: {
          status: 'healthy',
          uptimeSeconds,
          nodeVersion: process.version,
          memoryHeapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          memoryRssMb: Math.round(memory.rss / 1024 / 1024),
        },
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          provider: 'PostgreSQL with pgvector',
        },
        redis: {
          status: redisStatus,
          latencyMs: redisLatencyMs,
          queue: queueCounts,
        },
        aiProviders,
        channels: {
          activeChannels,
          whatsappWebhookSigned: Boolean(process.env.WHATSAPP_APP_SECRET),
          wahaWebhookSigned: Boolean(process.env.WAHA_WEBHOOK_HMAC_KEY),
        },
      },
    };
  }

  /**
   * The platform's effective configuration. These values come from environment
   * variables (so they are versioned with the deployment and identical on every
   * instance); this view is read-only and shows where each one is set.
   */
  getPlatformSettings() {
    const model = platformDefaultModel();
    const limits = platformDefaultLimits();
    return {
      source: 'environment',
      ai: {
        defaultProvider: { value: model.provider, env: 'AI_DEFAULT_PROVIDER' },
        defaultModel: { value: model.model, env: 'AI_DEFAULT_MODEL' },
        platformKeysAllowed: { value: platformKeysAllowed(), env: 'AI_ALLOW_PLATFORM_KEYS' },
      },
      defaultTenantLimits: {
        dailyBudgetUsd: { value: limits.dailyBudgetUsd, env: 'AI_DEFAULT_DAILY_BUDGET_USD' },
        monthlyBudgetUsd: { value: limits.monthlyBudgetUsd, env: 'AI_DEFAULT_MONTHLY_BUDGET_USD' },
        maxTaskCostUsd: { value: limits.maxTaskCostUsd, env: 'AI_DEFAULT_MAX_TASK_COST_USD' },
        maxTaskSteps: { value: limits.maxTaskSteps, env: 'AI_DEFAULT_MAX_TASK_STEPS' },
        maxConcurrentTasks: { value: limits.maxConcurrentTasks, env: 'AI_DEFAULT_MAX_CONCURRENT_TASKS' },
        maxTasksPerDay: { value: limits.maxTasksPerDay, env: 'AI_DEFAULT_MAX_TASKS_PER_DAY' },
        maxSchedules: { value: limits.maxSchedules, env: 'AI_DEFAULT_MAX_SCHEDULES' },
      },
      security: {
        rateLimitPerMinute: { value: Number(process.env.RATE_LIMIT_PER_MINUTE) || 120, env: 'RATE_LIMIT_PER_MINUTE' },
        corsOrigins: { value: process.env.CORS_ORIGINS || '(any origin)', env: 'CORS_ORIGINS' },
        integrationPrivateNetwork: {
          value: process.env.INTEGRATION_ALLOW_PRIVATE_NETWORK ? process.env.INTEGRATION_ALLOW_PRIVATE_NETWORK === 'true' : process.env.NODE_ENV !== 'production',
          env: 'INTEGRATION_ALLOW_PRIVATE_NETWORK',
        },
      },
      workers: {
        runsWorker: { value: process.env.AI_WORKFORCE_WORKER !== 'false', env: 'AI_WORKFORCE_WORKER' },
        concurrency: { value: Number(process.env.AI_WORKFORCE_WORKER_CONCURRENCY) || 5, env: 'AI_WORKFORCE_WORKER_CONCURRENCY' },
      },
      perTenantOverrides: 'Per-business AI limits can be changed from the AI usage page (audited).',
    };
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

  /** Audit entry for an admin change made outside this service (e.g. plan reply modes). */
  recordAdminAction(actor: AdminActor, action: string, targetType: string, targetId: string, changes: Record<string, unknown>) {
    return this.recordAudit(actor, action, targetType, targetId, changes);
  }

  private recordAudit(
    actor: AdminActor,
    action: string,
    targetType: string,
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


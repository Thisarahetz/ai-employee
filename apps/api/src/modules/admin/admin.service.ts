import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationSkip, toPaginatedResponse, toPaginationRequest } from '@ai-employee/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BUSINESS_TEMPLATES } from '../ai-employee/ai-employee-templates';
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

  /** Centralized catalog of all pre-built AI employee templates by industry. */
  async getAiTemplatesCatalog() {
    const templates = Object.values(BUSINESS_TEMPLATES);

    const businessCounts = await this.prisma.business.groupBy({
      by: ['type'],
      _count: { tenantId: true },
    });
    const typeMap = new Map<string, number>();
    for (const b of businessCounts) {
      typeMap.set(b.type, b._count.tenantId);
    }

    return templates.map((tmpl) => ({
      id: tmpl.id,
      name: tmpl.name,
      category: tmpl.category,
      icon: tmpl.icon,
      description: tmpl.description,
      suggestedEmployeesCount: tmpl.suggestedEmployees.length,
      suggestedEmployees: tmpl.suggestedEmployees,
      adoptionCount: typeMap.get(tmpl.id) ?? 0,
    }));
  }

  /** Supported business types catalog and metrics. */
  async getBusinessTypesCatalog() {
    const businessCounts = await this.prisma.business.groupBy({
      by: ['type'],
      _count: { id: true },
    });
    const typeCounts = new Map(businessCounts.map((b) => [b.type, b._count.id]));

    const catalog = [
      {
        id: 'SALON',
        name: 'Salon & Spa',
        category: 'Services',
        description: 'Hair salons, nail bars, beauty clinics, wellness spas.',
        recommendedChannels: ['WhatsApp', 'Website Chat', 'Instagram'],
        defaultTemplates: ['SALON_SPA'],
        activeCount: typeCounts.get('SALON') ?? 0,
      },
      {
        id: 'CLINIC',
        name: 'Medical & Dental Clinic',
        category: 'Healthcare',
        description: 'Dental practices, physiotherapy, specialized consultations.',
        recommendedChannels: ['WhatsApp', 'Website Chat', 'SMS'],
        defaultTemplates: ['DENTAL_CLINIC', 'HEALTH_CLINIC'],
        activeCount: typeCounts.get('CLINIC') ?? 0,
      },
      {
        id: 'HOTEL',
        name: 'Hotel & Hospitality',
        category: 'Hospitality',
        description: 'Boutique stays, resorts, serviced apartments, guesthouses.',
        recommendedChannels: ['WhatsApp', 'Website Chat', 'Telegram'],
        defaultTemplates: ['HOTEL_HOSPITALITY'],
        activeCount: typeCounts.get('HOTEL') ?? 0,
      },
      {
        id: 'ECOMMERCE',
        name: 'Retail & E-commerce',
        category: 'Retail',
        description: 'Mobile phone shops, electronics, apparel, grocery, online retail.',
        recommendedChannels: ['Website Chat', 'WhatsApp', 'Instagram'],
        defaultTemplates: ['PHONE_SHOP', 'GENERAL_RETAIL', 'GROCERY_SUPERMARKET'],
        activeCount: typeCounts.get('ECOMMERCE') ?? 0,
      },
      {
        id: 'VEHICLE_SERVICE',
        name: 'Automotive & Garage',
        category: 'Trade',
        description: 'Vehicle servicing, repairs, detailing, MOT & tyre centers.',
        recommendedChannels: ['WhatsApp', 'Website Chat', 'SMS'],
        defaultTemplates: ['AUTO_SERVICE'],
        activeCount: typeCounts.get('VEHICLE_SERVICE') ?? 0,
      },
      {
        id: 'CRM',
        name: 'Real Estate & Property',
        category: 'Corporate',
        description: 'Estate agents, property managers, commercial leasing.',
        recommendedChannels: ['WhatsApp', 'Website Chat', 'Email'],
        defaultTemplates: ['REAL_ESTATE'],
        activeCount: typeCounts.get('CRM') ?? 0,
      },
      {
        id: 'ERP',
        name: 'Professional Services',
        category: 'Corporate',
        description: 'Accountancy, legal consulting, corporate advisory.',
        recommendedChannels: ['Email', 'Website Chat'],
        defaultTemplates: ['ACCOUNTING_FIRM', 'FITNESS_GYM'],
        activeCount: typeCounts.get('ERP') ?? 0,
      },
      {
        id: 'CUSTOM',
        name: 'General & Custom Business',
        category: 'General',
        description: 'Custom setups, educational centers, multi-service companies.',
        recommendedChannels: ['WhatsApp', 'Website Chat'],
        defaultTemplates: ['GENERAL_RETAIL'],
        activeCount: typeCounts.get('CUSTOM') ?? 0,
      },
    ];

    return catalog;
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
        this.prisma.tenant.findMany({
          take: 6,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
            _count: { select: { conversations: true, messages: true, aiEmployees: true } },
          },
        }),
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

    const redisConfigured = Boolean(process.env.REDIS_HOST);
    const redisStatus = redisConfigured ? 'healthy' : 'unconfigured';

    const aiProviders = {
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        status: process.env.OPENAI_API_KEY ? 'active' : 'not_configured',
        defaultModel: 'gpt-4o-mini',
      },
      anthropic: {
        configured: Boolean(process.env.ANTHROPIC_API_KEY),
        status: process.env.ANTHROPIC_API_KEY ? 'active' : 'not_configured',
        defaultModel: 'claude-3-5-sonnet',
      },
      gemini: {
        configured: Boolean(process.env.GEMINI_API_KEY),
        status: process.env.GEMINI_API_KEY ? 'active' : 'not_configured',
        defaultModel: 'gemini-1.5-flash',
      },
    };

    const activeChannels = await this.prisma.channel.count({ where: { status: 'ACTIVE' } });

    return {
      status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
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
          host: process.env.REDIS_HOST || 'localhost',
          port: +(process.env.REDIS_PORT ?? 6379),
        },
        aiProviders,
        channels: {
          activeChannels,
          whatsappWebhookReady: true,
        },
      },
    };
  }

  private platformSettings = {
    defaultPlan: 'free',
    trialDays: 14,
    defaultFastModel: 'gpt-4o-mini',
    defaultReasoningModel: 'claude-3-5-sonnet',
    alertWebhookUrl: '',
    maintenanceMode: false,
    systemNotice: 'System fully operational across all clusters.',
  };

  getPlatformSettings() {
    return this.platformSettings;
  }

  async updatePlatformSettings(dto: Partial<typeof this.platformSettings>, actor: AdminActor) {
    const before = { ...this.platformSettings };
    this.platformSettings = { ...this.platformSettings, ...dto };

    await this.recordAudit(actor, 'platform.update_settings', 'platform', 'GLOBAL', {
      before,
      after: this.platformSettings,
    });

    return this.platformSettings;
  }

  /**
   * Nuclear "clean database" — wipes all tenant-scoped data and all
   * non-platform-admin user identities.  Safe to call from the API because it
   * uses Prisma cascades (not `prisma db push --force-reset`), so the schema
   * stays intact and super-admin accounts keep working after the reset.
   *
   * Execution order:
   *   1. Write the audit log entry FIRST (survives even if the delete fails).
   *   2. Delete all Tenant rows — cascades wipe every child record in the DB
   *      (businesses, conversations, messages, customers, integrations, etc.).
   *   3. Delete non-platform-admin User rows (global identities with no tenant).
   *   4. Return a counts summary.
   */
  async cleanDatabase(actor: AdminActor) {
    // Snapshot counts before we delete anything — used in the response summary.
    const [tenantCount, userCount, conversationCount, messageCount] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count({ where: { platformRole: 'NONE' } }),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
    ]);

    // Audit BEFORE delete so we always have a record, even on partial failure.
    await this.recordAudit(actor, 'platform.clean_database', 'platform', 'GLOBAL', {
      snapshot: { tenantCount, userCount, conversationCount, messageCount },
      warning: 'All tenant-scoped data and non-admin user identities were wiped.',
    });

    // Cascade-delete every tenant (wipes all child rows automatically).
    await this.prisma.tenant.deleteMany({});

    // Remove global User identities that have no platform role.
    // Super-admins (platformRole = SUPER_ADMIN) are preserved so /admin stays accessible.
    await this.prisma.user.deleteMany({ where: { platformRole: 'NONE' } });

    return {
      success: true,
      message: 'Database cleaned. All tenant data and non-admin user identities have been removed.',
      removed: {
        tenants: tenantCount,
        nonAdminUsers: userCount,
        conversations: conversationCount,
        messages: messageCount,
      },
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


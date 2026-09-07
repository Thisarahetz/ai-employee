import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import {
  ACCESS_LEVEL_PRESETS,
  getRoleTemplatesForBusinessType,
  PERMISSION_CATEGORIES,
} from './user-roles-templates';

const BCRYPT_ROUNDS = 10;

const MEMBER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export interface ActorContext {
  userId?: string;
  role?: TenantRole | null;
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Return business role templates & permission catalogue tailored to this tenant's business type. */
  async getRoleTemplates(tenantId: string) {
    const primaryBusiness = await this.prisma.business.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    const businessType = primaryBusiness?.type || 'CUSTOM';
    const templates = getRoleTemplatesForBusinessType(businessType);

    return {
      businessType,
      templates,
      categories: PERMISSION_CATEGORIES,
      accessLevelPresets: ACCESS_LEVEL_PRESETS,
    };
  }

  /** List all team members under the tenant, enriched with human-readable branch locations. */
  async list(tenantId: string) {
    const [memberships, businesses] = await Promise.all([
      this.prisma.tenantMembership.findMany({
        where: { tenantId },
        include: { user: { select: MEMBER_SELECT } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.business.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
    ]);

    const businessMap = new Map(businesses.map((b) => [b.id, b.name]));

    return memberships.map((m) => {
      const locations = m.allLocations
        ? businesses.map((b) => ({ id: b.id, name: b.name }))
        : (m.locationIds || [])
            .map((id) => ({ id, name: businessMap.get(id) || 'Unknown Location' }))
            .filter(Boolean);

      return {
        ...m,
        locations,
      };
    });
  }

  /** Get single member detail with location authorization and recent operational audit history. */
  async get(tenantId: string, membershipId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: { select: MEMBER_SELECT } },
    });

    if (!membership) {
      throw new NotFoundException('Team member not found');
    }

    const businesses = await this.prisma.business.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const businessMap = new Map(businesses.map((b) => [b.id, b.name]));

    const locations = membership.allLocations
      ? businesses.map((b) => ({ id: b.id, name: b.name }))
      : (membership.locationIds || [])
          .map((id) => ({ id, name: businessMap.get(id) || 'Unknown Location' }))
          .filter(Boolean);

    // Fetch recent audit logs relating to this user
    const recentActivity = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        OR: [
          { entityId: membershipId },
          { entityId: membership.userId },
          { userId: membership.userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      ...membership,
      locations,
      recentActivity,
    };
  }

  /** Invite or add an employee to this business with predefined role, locations, and safety checks. */
  async invite(tenantId: string, dto: InviteUserDto, actor?: ActorContext) {
    // 1. Hierarchy & Ownership Protection
    if ((dto.role as string) === 'OWNER') {
      throw new BadRequestException('Business ownership cannot be assigned through invitation.');
    }

    if (actor?.role === 'MANAGER' && dto.role !== 'EMPLOYEE') {
      throw new ForbiddenException('Managers can only invite standard operational staff.');
    }

    const email = dto.email.toLowerCase().trim();
    let user = await this.prisma.user.findUnique({ where: { email } });
    let temporaryPassword: string | undefined;

    // 2. Resolve default permissions based on access level or preset
    let permissions = dto.permissions ?? [];
    if (!permissions.length) {
      if (dto.accessLevel && ACCESS_LEVEL_PRESETS[dto.accessLevel]) {
        permissions = ACCESS_LEVEL_PRESETS[dto.accessLevel];
      } else if (dto.role === 'ADMIN') {
        permissions = ACCESS_LEVEL_PRESETS.MANAGER;
      } else if (dto.role === 'MANAGER') {
        permissions = ACCESS_LEVEL_PRESETS.MANAGER;
      } else {
        permissions = ACCESS_LEVEL_PRESETS.STANDARD;
      }
    }

    // 3. Find or create global user identity
    if (!user) {
      temporaryPassword = randomBytes(9).toString('base64url');
      const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone?.trim() || null,
        },
      });
    } else if (dto.phone && !user.phone) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phone: dto.phone.trim() },
      });
    }

    // 4. Prevent duplicate membership
    const existingMembership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existingMembership) {
      throw new BadRequestException('This person is already a member of this business.');
    }

    // 5. Create membership row
    const membership = await this.prisma.tenantMembership.create({
      data: {
        tenantId,
        userId: user.id,
        role: dto.role,
        status: 'ACTIVE',
        businessRole: dto.businessRole || dto.role,
        jobTitle: dto.jobTitle || dto.businessRole || dto.role,
        accessLevel: dto.accessLevel || (dto.role === 'ADMIN' ? 'FULL' : 'STANDARD'),
        permissions,
        allLocations: dto.allLocations ?? true,
        locationIds: dto.locationIds ?? [],
        invitedBy: actor?.userId || null,
      },
      include: { user: { select: MEMBER_SELECT } },
    });

    // 6. Record human-readable business audit log
    const actorName = await this.resolveActorName(actor?.userId);
    const locationDesc = membership.allLocations ? 'All Locations' : `${membership.locationIds.length} assigned branch(es)`;
    await this.auditLogService.record(
      tenantId,
      actor?.userId,
      'TEAM_MEMBER_INVITED',
      'TenantMembership',
      membership.id,
      {
        summary: `${actorName} added ${user.firstName} ${user.lastName} as ${membership.jobTitle} (${locationDesc}).`,
        targetEmail: user.email,
        role: membership.role,
        jobTitle: membership.jobTitle,
        accessLevel: membership.accessLevel,
      },
    );

    return { membership, temporaryPassword };
  }

  /** Update member role, branch assignment, permissions, or active/disabled status. */
  async update(
    tenantId: string,
    membershipId: string,
    dto: UpdateMembershipDto,
    actor?: ActorContext,
  ) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: { select: MEMBER_SELECT } },
    });

    if (!membership) {
      throw new NotFoundException('Team member not found');
    }

    // 1. Ownership Protection
    if (membership.role === 'OWNER' && actor?.role && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only a business owner can modify or reassign another owner.');
    }

    if (dto.role === 'OWNER' && actor?.role && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only a business owner can transfer or grant business ownership.');
    }

    await this.guardLastOwner(tenantId, membership, dto);

    // 2. Update user profile if name or phone changed
    if (dto.firstName || dto.lastName || dto.phone !== undefined) {
      await this.prisma.user.update({
        where: { id: membership.userId },
        data: {
          firstName: dto.firstName?.trim() || undefined,
          lastName: dto.lastName?.trim() || undefined,
          phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
        },
      });
    }

    // 3. Resolve permissions if accessLevel updated
    let permissions = dto.permissions;
    if (dto.accessLevel && !dto.permissions && ACCESS_LEVEL_PRESETS[dto.accessLevel]) {
      permissions = ACCESS_LEVEL_PRESETS[dto.accessLevel];
    }

    // 4. Update membership
    const updated = await this.prisma.tenantMembership.update({
      where: { id: membershipId },
      data: {
        role: dto.role,
        status: dto.status,
        jobTitle: dto.jobTitle,
        businessRole: dto.businessRole,
        accessLevel: dto.accessLevel,
        permissions,
        allLocations: dto.allLocations,
        locationIds: dto.locationIds,
      },
      include: { user: { select: MEMBER_SELECT } },
    });

    // 5. If disabled, revoke active refresh tokens so access terminates immediately
    if (dto.status === 'DISABLED') {
      await this.prisma.user.update({
        where: { id: membership.userId },
        data: { refreshTokenHash: null },
      });
    }

    // 6. Record human-readable audit log
    const actorName = await this.resolveActorName(actor?.userId);
    let summary = `${actorName} updated ${membership.user.firstName} ${membership.user.lastName}'s settings.`;
    if (dto.status === 'DISABLED') {
      summary = `${actorName} disabled ${membership.user.firstName} ${membership.user.lastName}'s account.`;
    } else if (dto.status === 'ACTIVE' && membership.status === 'DISABLED') {
      summary = `${actorName} reactivated ${membership.user.firstName} ${membership.user.lastName}'s account.`;
    } else if (dto.jobTitle || dto.role) {
      summary = `${actorName} changed ${membership.user.firstName} ${membership.user.lastName}'s role to ${dto.jobTitle || dto.role}.`;
    }

    await this.auditLogService.record(
      tenantId,
      actor?.userId,
      'TEAM_MEMBER_UPDATED',
      'TenantMembership',
      membershipId,
      {
        summary,
        changes: dto,
      },
    );

    return updated;
  }

  /** Resend invitation and generate a new temporary password for invited staff. */
  async resendInvite(tenantId: string, membershipId: string, actor?: ActorContext) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: { select: MEMBER_SELECT } },
    });

    if (!membership) {
      throw new NotFoundException('Team member not found');
    }

    const temporaryPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: membership.userId },
      data: { passwordHash },
    });

    const actorName = await this.resolveActorName(actor?.userId);
    await this.auditLogService.record(
      tenantId,
      actor?.userId,
      'TEAM_MEMBER_INVITATION_RESENT',
      'TenantMembership',
      membershipId,
      {
        summary: `${actorName} resent invitation to ${membership.user.firstName} ${membership.user.lastName}.`,
      },
    );

    return {
      success: true,
      temporaryPassword,
      message: 'Invitation resent successfully.',
    };
  }

  /** Cancel pending invitation. */
  async cancelInvite(tenantId: string, membershipId: string, actor?: ActorContext) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: { select: MEMBER_SELECT } },
    });

    if (!membership) {
      throw new NotFoundException('Team member not found');
    }

    await this.prisma.tenantMembership.delete({ where: { id: membershipId } });

    const actorName = await this.resolveActorName(actor?.userId);
    await this.auditLogService.record(
      tenantId,
      actor?.userId,
      'TEAM_MEMBER_INVITATION_CANCELLED',
      'TenantMembership',
      membershipId,
      {
        summary: `${actorName} cancelled invitation for ${membership.user.firstName} ${membership.user.lastName}.`,
      },
    );

    return { success: true };
  }

  /** Remove member from business with ownership protection and audit trail. */
  async remove(tenantId: string, membershipId: string, actor?: ActorContext) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: { select: MEMBER_SELECT } },
    });

    if (!membership) {
      throw new NotFoundException('Team member not found');
    }

    // Ownership Protection
    if (membership.role === 'OWNER' && actor?.role && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only a business owner can remove another owner.');
    }

    await this.guardLastOwner(tenantId, membership, { status: 'DISABLED' });

    await this.prisma.tenantMembership.delete({ where: { id: membershipId } });

    const actorName = await this.resolveActorName(actor?.userId);
    await this.auditLogService.record(
      tenantId,
      actor?.userId,
      'TEAM_MEMBER_REMOVED',
      'TenantMembership',
      membershipId,
      {
        summary: `${actorName} removed team member ${membership.user.firstName} ${membership.user.lastName}.`,
      },
    );

    return { success: true };
  }

  /** Ensure a business is never left with zero active owners. */
  private async guardLastOwner(
    tenantId: string,
    membership: { role: string },
    change: { role?: string; status?: string },
  ) {
    const isDemotingOwner = membership.role === 'OWNER' && change.role && change.role !== 'OWNER';
    const isDisablingOwner = membership.role === 'OWNER' && change.status === 'DISABLED';
    if (!isDemotingOwner && !isDisablingOwner) {
      return;
    }

    const ownerCount = await this.prisma.tenantMembership.count({
      where: { tenantId, role: 'OWNER', status: 'ACTIVE' },
    });
    if (ownerCount <= 1) {
      throw new BadRequestException('A business must always have at least one active owner.');
    }
  }

  private async resolveActorName(userId?: string): Promise<string> {
    if (!userId) return 'Owner';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : 'Owner';
  }
}

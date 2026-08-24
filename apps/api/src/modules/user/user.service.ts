import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';

const BCRYPT_ROUNDS = 10;

const MEMBER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/**
 * "Team" management — tenant-scoped view over TenantMembership (the
 * tenant_users join table), not over User directly, since a User is a
 * global identity that may belong to other tenants too. Deleting/disabling
 * here only ever affects this tenant's membership row.
 */
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.tenantMembership.findMany({
      where: { tenantId },
      include: { user: { select: MEMBER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(tenantId: string, membershipId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: { select: MEMBER_SELECT } },
    });
    if (!membership) {
      throw new NotFoundException('Team member not found');
    }
    return membership;
  }

  /**
   * Finds-or-creates the invitee's global User identity (generating a
   * one-time temp password if they're new — same pattern as
   * AdminService.createTenant), then creates an ACTIVE membership.
   */
  async invite(tenantId: string, dto: InviteUserDto) {
    const email = dto.email.toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    let temporaryPassword: string | undefined;

    if (!user) {
      temporaryPassword = randomBytes(9).toString('base64url');
      const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      user = await this.prisma.user.create({
        data: { email, passwordHash, firstName: dto.firstName, lastName: dto.lastName },
      });
    }

    const existingMembership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existingMembership) {
      throw new BadRequestException('This person is already a member of this tenant');
    }

    const membership = await this.prisma.tenantMembership.create({
      data: { tenantId, userId: user.id, role: dto.role, status: 'ACTIVE' },
      include: { user: { select: MEMBER_SELECT } },
    });

    return { membership, temporaryPassword };
  }

  async update(tenantId: string, membershipId: string, dto: UpdateMembershipDto) {
    const membership = await this.get(tenantId, membershipId);
    await this.guardLastOwner(tenantId, membership, dto);

    return this.prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { role: dto.role, status: dto.status },
      include: { user: { select: MEMBER_SELECT } },
    });
  }

  async remove(tenantId: string, membershipId: string) {
    const membership = await this.get(tenantId, membershipId);
    await this.guardLastOwner(tenantId, membership, { status: 'DISABLED' });

    await this.prisma.tenantMembership.delete({ where: { id: membershipId } });
    return { success: true };
  }

  /** A tenant can never end up with zero active owners. */
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
      throw new BadRequestException('A tenant must always have at least one active owner');
    }
  }
}

import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { BusinessType, PlatformRole, Tenant, TenantMembership, TenantRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const BCRYPT_ROUNDS = 10;

/**
 * Fixed permission grants per tenant role — see docs/architecture.md's
 * "Platform Administration & Tenant Management" section for the rationale.
 * `*` is treated by RolesGuard as "all permissions". Kept as a static map
 * (not customizable per-tenant) deliberately, to avoid over-engineering RBAC
 * before it's needed.
 */
const TENANT_ROLE_PERMISSIONS: Record<TenantRole, string[]> = {
  OWNER: ['*'],
  ADMIN: [
    'tenant:read',
    'tenant:write',
    'users:read',
    'users:write',
    'users:invite',
    'businesses:read',
    'businesses:write',
    'conversations:read',
    'conversations:write',
    'conversations:takeover',
    'messages:read',
    'messages:write',
    'human_handoffs:read',
    'human_handoffs:write',
    'notifications:read',
    'integrations:read',
    'integrations:manage',
    'channels:read',
    'channels:manage',
    'ai:configure',
    'workflows:manage',
    'audit_logs:read',
  ],
  // "Manage conversations/employees/handoffs, view reports" — but not tenant
  // settings, billing, or promoting/removing other members (users:write).
  MANAGER: [
    'tenant:read',
    'businesses:read',
    'users:read',
    'users:invite',
    'conversations:read',
    'conversations:write',
    'conversations:takeover',
    'messages:read',
    'messages:write',
    'human_handoffs:read',
    'human_handoffs:write',
    'notifications:read',
    'audit_logs:read',
  ],
  EMPLOYEE: [
    'conversations:read',
    'conversations:write',
    'conversations:takeover',
    'messages:read',
    'messages:write',
    'human_handoffs:read',
    'human_handoffs:write',
    'notifications:read',
  ],
};

interface IssuableUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  platformRole: PlatformRole;
}

type MembershipWithTenant = TenantMembership & { tenant: Tenant };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Creates a Tenant + default Business + a TenantMembership(OWNER), and
   * either a brand-new User or (only when `allowExistingUser` is true) an
   * existing global identity — shared by signup() and AdminService.createTenant().
   *
   * `allowExistingUser` is NOT safe for the public, unauthenticated signup()
   * path: silently attaching a new tenant to someone else's email (without
   * verifying their password) would let an attacker who merely knows a
   * target's email address get issued a session as them. It's only used by
   * AdminService, a trusted, PlatformAdminGuard-gated caller that never logs
   * the caller in as the (possibly pre-existing) owner — it just confirms
   * the tenant was created.
   */
  async createTenantWithOwner(params: {
    tenantName: string;
    tenantSlug?: string;
    businessType?: BusinessType;
    ownerEmail: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerPassword?: string;
    allowExistingUser: boolean;
  }) {
    const slug = this.slugify(params.tenantSlug || params.tenantName);
    const email = params.ownerEmail.toLowerCase();

    const existingTenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      throw new BadRequestException('A tenant with this slug already exists');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser && !params.allowExistingUser) {
      throw new BadRequestException('An account with this email already exists. Log in instead.');
    }
    if (!existingUser && !params.ownerPassword) {
      throw new BadRequestException('A password is required to create a new account.');
    }

    const passwordHash = params.ownerPassword ? await bcrypt.hash(params.ownerPassword, BCRYPT_ROUNDS) : undefined;

    const { user, tenant, membership, createdNewUser } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: params.tenantName, slug },
      });

      await tx.business.create({
        data: { tenantId: tenant.id, name: params.tenantName, type: params.businessType ?? 'CUSTOM' },
      });

      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            email,
            passwordHash: passwordHash!,
            firstName: params.ownerFirstName,
            lastName: params.ownerLastName,
          },
        }));

      const membership = await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' },
      });

      return { user, tenant, membership, createdNewUser: !existingUser };
    });

    return { user, tenant, membership: { ...membership, tenant }, createdNewUser };
  }

  async signup(dto: SignupDto) {
    const { user, membership } = await this.createTenantWithOwner({
      tenantName: dto.tenantName,
      tenantSlug: dto.tenantSlug,
      businessType: dto.businessType,
      ownerEmail: dto.email,
      ownerPassword: dto.password,
      ownerFirstName: dto.firstName,
      ownerLastName: dto.lastName,
      allowExistingUser: false,
    });

    return this.issueTokens(user, membership, [membership]);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: { where: { status: 'ACTIVE' }, include: { tenant: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'DISABLED') {
      throw new UnauthorizedException('This account has been disabled');
    }

    if (user.memberships.length === 0 && user.platformRole === 'NONE') {
      throw new UnauthorizedException('This account has no tenant access');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // No per-user "last active tenant" tracking yet — default to their
    // oldest membership (deterministic); the web app's tenant switcher
    // (POST /auth/switch-tenant) covers the rest.
    return this.issueTokens(user, user.memberships[0], user.memberships);
  }

  async switchTenant(userId: string, tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { where: { status: 'ACTIVE' }, include: { tenant: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    const membership = user.memberships.find((m) => m.tenantId === tenantId);
    if (!membership) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    return this.issueTokens(user, membership, user.memberships);
  }

  async refresh(refreshToken: string) {
    let claims: { sub: string; tenantId: string | null };
    try {
      claims = await this.jwtService.verifyAsync<{ sub: string; tenantId: string | null }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      include: {
        memberships: { where: { status: 'ACTIVE' }, include: { tenant: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (user.status === 'DISABLED') {
      throw new UnauthorizedException('This account has been disabled');
    }

    // Stay on the tenant this refresh token was scoped to, if it's still a
    // valid active membership; otherwise fall back to their first tenant.
    const current = claims.tenantId ? user.memberships.find((m) => m.tenantId === claims.tenantId) : undefined;
    return this.issueTokens(user, current ?? user.memberships[0], user.memberships);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true };
  }

  private async issueTokens(
    user: IssuableUser,
    activeMembership: MembershipWithTenant | undefined,
    allMemberships: MembershipWithTenant[],
  ) {
    let permissions = activeMembership ? TENANT_ROLE_PERMISSIONS[activeMembership.role] : [];
    if (activeMembership?.permissions && activeMembership.permissions.length > 0) {
      permissions = activeMembership.permissions;
    }
    const payload = {
      sub: user.id,
      tenantId: activeMembership?.tenantId ?? null,
      role: activeMembership?.role ?? null,
      permissions,
      allLocations: activeMembership?.allLocations ?? true,
      locationIds: activeMembership?.locationIds ?? [],
      email: user.email,
      platformRole: user.platformRole,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await bcrypt.hash(refreshToken, BCRYPT_ROUNDS) },
    });

    // Never include passwordHash/refreshTokenHash here.
    return {
      accessToken,
      refreshToken,
      activeTenantId: activeMembership?.tenantId ?? null,
      memberships: allMemberships.map((m) => ({
        tenantId: m.tenantId,
        role: m.role,
        status: m.status,
        tenant: m.tenant,
      })),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        platformRole: user.platformRole,
      },
    };
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}

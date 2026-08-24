import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const BCRYPT_ROUNDS = 10;

/**
 * Default permission grants for the four system roles created on signup.
 * `*` is treated by `RolesGuard` as "all permissions" (see roles.guard.ts).
 */
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
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
  AGENT: [
    'conversations:read',
    'conversations:write',
    'conversations:takeover',
    'messages:read',
    'messages:write',
    'human_handoffs:read',
    'human_handoffs:write',
    'notifications:read',
  ],
  VIEWER: [
    'tenant:read',
    'businesses:read',
    'conversations:read',
    'messages:read',
    'human_handoffs:read',
    'notifications:read',
    'audit_logs:read',
  ],
};

interface IssuableUser {
  id: string;
  tenantId: string;
  roleId: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Creates a Tenant + default Business + the four system Roles + the first
   * User (as OWNER) in a single transaction, then issues tokens.
   */
  async signup(dto: SignupDto) {
    const slug = this.slugify(dto.tenantSlug || dto.tenantName);

    const existingTenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      throw new BadRequestException('A tenant with this slug already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, ownerRole } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, slug },
      });

      await tx.business.create({
        data: { tenantId: tenant.id, name: dto.tenantName },
      });

      const roles = await Promise.all(
        Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([name, permissions]) =>
          tx.role.create({
            data: { tenantId: tenant.id, name, permissions, isSystem: true },
          }),
        ),
      );
      const ownerRole = roles.find((role) => role.name === 'OWNER')!;

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roleId: ownerRole.id,
        },
      });

      return { user, ownerRole };
    });

    return this.issueTokens(user, ownerRole.permissions);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user, user.role.permissions);
  }

  async refresh(refreshToken: string) {
    let claims: { sub: string };
    try {
      claims = await this.jwtService.verifyAsync<{ sub: string }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      include: { role: true },
    });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user, user.role.permissions);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true };
  }

  private async issueTokens(user: IssuableUser, permissions: string[]) {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      permissions,
      email: user.email,
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

    return { accessToken, refreshToken };
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}

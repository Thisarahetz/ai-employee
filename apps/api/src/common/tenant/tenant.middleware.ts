import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformRole, TenantRole } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant-context';

interface AccessTokenClaims {
  sub: string;
  tenantId: string | null;
  role: TenantRole | null;
  permissions?: string[];
  platformRole?: PlatformRole;
}

/**
 * Populates `request.tenantContext` from the caller's access-token claims
 * (`sub` -> userId, `tenantId`, `role`, `permissions`, `platformRole`).
 *
 * NestJS runs middleware before guards, so this middleware verifies the
 * token itself (same secret/strategy as `JwtStrategy`) rather than relying
 * on `JwtAuthGuard` having run first. `JwtAuthGuard` remains the source of
 * truth for rejecting unauthenticated requests (401) — this middleware
 * simply leaves `tenantContext` unset when no valid token is present, which
 * `RolesGuard`/route handlers treat as "unauthenticated".
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      try {
        const claims = this.jwtService.verify<AccessTokenClaims>(token, {
          secret: process.env.JWT_ACCESS_SECRET,
        });

        (req as Request & { tenantContext?: TenantContext }).tenantContext = {
          // See the doc-comment on TenantContext — genuinely nullable at
          // runtime for a platform admin with no tenant memberships.
          tenantId: claims.tenantId as string,
          userId: claims.sub,
          role: claims.role,
          permissions: claims.permissions ?? [],
          platformRole: claims.platformRole ?? 'NONE',
        };
      } catch {
        // invalid/expired token: leave tenantContext unset, JwtAuthGuard rejects downstream
      }
    }

    next();
  }
}

import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant-context';

interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  roleId: string;
  permissions?: string[];
}

/**
 * Populates `request.tenantContext` from the caller's access-token claims
 * (`sub` -> userId, `tenantId`, `roleId`, `permissions`).
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
          tenantId: claims.tenantId,
          userId: claims.sub,
          roleId: claims.roleId,
          permissions: claims.permissions ?? [],
        };
      } catch {
        // invalid/expired token: leave tenantContext unset, JwtAuthGuard rejects downstream
      }
    }

    next();
  }
}

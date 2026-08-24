import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { PlatformRole, TenantRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: TenantRole | null;
  permissions: string[];
  email: string;
  platformRole: PlatformRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    return payload;
  }
}

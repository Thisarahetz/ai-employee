import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export const SERVICE_TOKEN_HEADER = 'x-service-token';

/**
 * Authenticates trusted internal callers (n8n workflows calling back into the
 * API) with a shared secret in the `x-service-token` header, compared in
 * constant time against INTERNAL_SERVICE_TOKEN. Fails closed: when the env var
 * is unset, every request is rejected.
 *
 * Use together with `@Public()` (no user JWT on these calls).
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_SERVICE_TOKEN?.trim();
    if (!expected) {
      this.logger.error('INTERNAL_SERVICE_TOKEN is not set; rejecting internal service call.');
      throw new UnauthorizedException('Internal service authentication is not configured');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.headers[SERVICE_TOKEN_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (!provided || !safeEqual(provided, expected)) throw new UnauthorizedException('Invalid service token');
    return true;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

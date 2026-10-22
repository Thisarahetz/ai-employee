import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Assigns/propagates x-request-id and writes one access-log line per request. */
export function requestContext(req: Request & { requestId?: string; tenantContext?: { tenantId?: string; userId?: string } }, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/health') return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = {
      msg: 'request',
      requestId: id,
      method: req.method,
      path: req.path, // no query string: it can carry tokens/PII
      status: res.statusCode,
      durationMs: Math.round(ms),
      tenantId: req.tenantContext?.tenantId,
      userId: req.tenantContext?.userId,
    };
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
  next();
}

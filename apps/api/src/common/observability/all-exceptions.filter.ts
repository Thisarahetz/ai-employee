import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Last-resort error handler: HttpExceptions pass through unchanged; anything
 * else is logged with its stack and request id, and the client only gets a
 * generic 500 plus the id to quote — never internal messages or SQL.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string; tenantContext?: { tenantId?: string } }>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      { msg: 'unhandled_error', requestId: req.requestId, method: req.method, path: req.path, tenantId: req.tenantContext?.tenantId, error: err.message },
      err.stack,
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Internal server error', requestId: req.requestId });
  }
}

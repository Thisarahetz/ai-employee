import helmet from 'helmet';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { requestContext } from './common/observability/request-context';
import { AllExceptionsFilter } from './common/observability/all-exceptions.filter';

/** HTTP setup shared by main.ts and the integration tests, so tests run the real stack. */
export function configureApp(app: INestApplication) {
  // Behind a load balancer / nginx, rate limits and audit IPs need the real client IP.
  // Set TRUST_PROXY to the number of proxy hops (e.g. 1) or "true".
  if (process.env.TRUST_PROXY) {
    const v = process.env.TRUST_PROXY;
    (app as unknown as { set: (k: string, v: unknown) => void }).set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true');
  }

  // Normalize /api/v1 routes so automation workflows and external callers can use either /api/v1/... or /...
  app.use((req: any, _res: any, next: any) => {
    if (req.url.startsWith('/api/v1')) {
      req.url = req.url.replace(/^\/api\/v1/, '') || '/';
    }
    next();
  });
  app.use(requestContext);
  app.use(helmet());

  // `origin: true` reflects any request origin. The embedded website-chat widget
  // loads on arbitrary customer domains and calls the public
  // /channels/website-chat/* endpoints; the app itself authenticates with
  // `Authorization: Bearer` + localStorage (no cookies), so there's no CSRF
  // surface to protect by pinning origins. Set CORS_ORIGINS to a comma-listed
  // allow-list (no `*`) to lock this down in production.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const restrictCors = corsOrigins && corsOrigins.length > 0 && !corsOrigins.includes('*');
  app.enableCors({ origin: restrictCors ? corsOrigins : true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  return app;
}

import 'reflect-metadata';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Normalize /api/v1 routes so automation workflows and external callers can use either /api/v1/... or /...
  app.use((req: any, _res: any, next: any) => {
    if (req.url.startsWith('/api/v1')) {
      req.url = req.url.replace(/^\/api\/v1/, '') || '/';
    }
    next();
  });

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
  app.enableCors({
    origin: restrictCors ? corsOrigins : true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`AI Employee API listening on port ${port}`);
}

bootstrap();

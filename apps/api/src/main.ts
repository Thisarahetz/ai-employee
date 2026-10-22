import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertValidEnv } from './config/env.validation';
import { configureApp } from './bootstrap';
import { createAppLogger } from './common/observability/json-logger';

async function bootstrap() {
  assertValidEnv();
  // rawBody: webhook signature checks (Meta, WAHA) need the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: createAppLogger() });
  configureApp(app);

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  new Logger('Bootstrap').log(`AI Employee API listening on port ${port}`);
}

bootstrap().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

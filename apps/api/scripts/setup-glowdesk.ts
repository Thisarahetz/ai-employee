import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { IntegrationService } from '../src/modules/integration/integration.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { IntegrationType, CredentialType } from '@prisma/client';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const integrationService = app.get(IntegrationService);

  // Find the first tenant in the system (the user's workspace)
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('No tenant found. Run the seed script first.');
    process.exit(1);
  }

  console.log(`Using tenant: ${tenant.name} (${tenant.id})`);

  // Create GlowDesk Integration
  const integration = await integrationService.create(tenant.id, {
    name: 'GlowDesk',
    type: IntegrationType.REST_API,
    baseUrl: 'http://localhost:3141',
    config: {},
  });
  console.log(`Created integration: ${integration.id}`);

  // Add the Bearer Token Credential
  await integrationService.addCredential(tenant.id, integration.id, {
    type: CredentialType.BEARER_TOKEN,
    payload: { token: 'ai-employee-test-token' }
  });
  console.log(`Added bearer token credential.`);

  // Trigger Discovery
  try {
    const result = await integrationService.discover(tenant.id, integration.id);
    console.log(`Discovery successful: Found ${result.discovered} actions.`);
  } catch (err: any) {
    console.error('Discovery failed:', err.message);
  }

  await app.close();
}

bootstrap();

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

  // Create the GlowDesk Integration (idempotent — reuse an existing one by name)
  let integration = await prisma.integration.findFirst({
    where: { tenantId: tenant.id, name: 'GlowDesk' },
  });
  if (integration) {
    console.log(`Reusing existing integration: ${integration.id}`);
  } else {
    integration = await integrationService.create(tenant.id, {
      name: 'GlowDesk',
      type: IntegrationType.REST_API,
      baseUrl: 'http://localhost:3141',
      config: {},
    });
    console.log(`Created integration: ${integration.id}`);

    await integrationService.addCredential(tenant.id, integration.id, {
      type: CredentialType.BEARER_TOKEN,
      payload: { token: 'ai-employee-test-token' },
    });
    console.log('Added bearer token credential.');
  }

  // Discover actions (GET /ai/actions -> IntegrationAction rows for the Action Agent)
  try {
    const result = await integrationService.discover(tenant.id, integration.id);
    console.log(`Discovery successful: found ${result.discovered} actions.`);
  } catch (err: any) {
    console.error('Discovery failed:', err.message);
  }

  // Sync knowledge (GET /ai/knowledge -> docs in the "GlowDesk (synced)" KB + Location records)
  try {
    const result = await integrationService.syncKnowledge(tenant.id, integration.id);
    console.log(
      `Knowledge sync successful: KB ${result.knowledgeBaseId} — ` +
        `documents ${result.created} added / ${result.updated} updated / ${result.removed} removed, ` +
        `locations ${result.locationsCreated} added / ${result.locationsUpdated} updated.`,
    );
  } catch (err: any) {
    console.error('Knowledge sync failed:', err.message);
  }

  await app.close();
}

bootstrap();

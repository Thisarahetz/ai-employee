/**
 * Connects one AI Employee tenant to its GlowDesk workspace.
 *
 * In GlowDesk, the salon owner creates an AI Employee API key (Settings →
 * AI Employee). Then, from this repo:
 *
 *   pnpm --filter @ai-employee/api exec ts-node --transpile-only scripts/setup-glowdesk.ts \
 *     --tenant <ai-employee-tenant-slug> \
 *     --base-url https://<salon-slug>.glowdesk.app/api \
 *     --api-key <key shown once in GlowDesk>
 *
 * (--api-key may instead come from GLOWDESK_AI_API_KEY.) Idempotent: re-running
 * rotates the stored credential and re-discovers actions/knowledge.
 */
import { NestFactory } from '@nestjs/core';
import { CredentialType, IntegrationType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { IntegrationService } from '../src/modules/integration/integration.service';
import { PrismaService } from '../src/prisma/prisma.service';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg('tenant');
  const baseUrl = arg('base-url')?.replace(/\/+$/, '');
  const apiKey = arg('api-key') ?? process.env.GLOWDESK_AI_API_KEY;
  if (!slug || !baseUrl || !apiKey) {
    throw new Error('Usage: setup-glowdesk.ts --tenant <slug> --base-url <glowdesk api url> --api-key <key>');
  }
  if (!/^https?:\/\//.test(baseUrl)) throw new Error('--base-url must start with http:// or https://');
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) throw new Error('--base-url must use https in production');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const integrations = app.get(IntegrationService);

    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new Error(`No AI Employee tenant with slug "${slug}".`);

    let integration = await prisma.integration.findFirst({ where: { tenantId: tenant.id, name: 'GlowDesk' } });
    if (integration) {
      if (integration.baseUrl !== baseUrl) integration = await integrations.update(tenant.id, integration.id, { baseUrl });
      console.log(`Using existing GlowDesk integration ${integration.id}`);
    } else {
      integration = await integrations.create(tenant.id, { name: 'GlowDesk', type: IntegrationType.REST_API, baseUrl, config: {} });
      console.log(`Created GlowDesk integration ${integration.id}`);
    }
    await integrations.addCredential(tenant.id, integration.id, { type: CredentialType.BEARER_TOKEN, payload: { token: apiKey } });
    console.log('Stored the API key (encrypted).');

    const discovered = await integrations.discover(tenant.id, integration.id);
    console.log(`Discovered ${discovered.discovered} GlowDesk actions.`);
    const kb = await integrations.syncKnowledge(tenant.id, integration.id);
    console.log(`Knowledge synced: ${kb.created} added, ${kb.updated} updated, ${kb.removed} removed; locations ${kb.locationsCreated} added, ${kb.locationsUpdated} updated.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * Deletes every Conversation for a single tenant, along with its Messages,
 * ConversationSummaries, HumanHandoffs (all cascade at the DB level) and the
 * conversation/message-linked AiUsageLog rows (which have no cascade, so they
 * are removed explicitly first). Embedding-only AiUsageLog rows — the ones with
 * no conversationId and no messageId, produced by RAG ingestion — are kept.
 *
 * Customers and Channels are NOT touched.
 *
 * Dry run by default: prints what would be deleted and exits. Pass --confirm to
 * actually delete.
 *
 * Usage (run from repo root, with DATABASE_URL in the environment — `source .env`
 * first):
 *
 *   # dry run — pick the tenant by id, slug, or a member's email
 *   pnpm --filter @ai-employee/api exec ts-node --transpile-only \
 *     scripts/delete-conversations.ts owner@acme.test
 *
 *   # actually delete
 *   pnpm --filter @ai-employee/api exec ts-node --transpile-only \
 *     scripts/delete-conversations.ts owner@acme.test --confirm
 *
 * If the database has exactly one tenant, the tenant argument may be omitted.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resolveTenant(ref: string | undefined) {
  if (!ref) {
    const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
    if (tenants.length === 1) return tenants[0];
    throw new Error(
      tenants.length === 0
        ? 'No tenants found in the database.'
        : `Multiple tenants found — pass one as an argument (id, slug, or a member's email):\n` +
            tenants.map((t) => `  - ${t.name}  (slug: ${t.slug}, id: ${t.id})`).join('\n'),
    );
  }

  const byIdOrSlug = await prisma.tenant.findFirst({
    where: { OR: [{ id: ref }, { slug: ref }] },
  });
  if (byIdOrSlug) return byIdOrSlug;

  const membership = await prisma.tenantMembership.findFirst({
    where: { user: { email: ref.toLowerCase() } },
    include: { tenant: true },
    orderBy: { createdAt: 'asc' },
  });
  if (membership) return membership.tenant;

  throw new Error(`No tenant matched "${ref}" (tried id, slug, and member email).`);
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const ref = args.find((a) => !a.startsWith('--'));

  const tenant = await resolveTenant(ref);

  const usageLogWhere = {
    tenantId: tenant.id,
    OR: [{ conversationId: { not: null } }, { messageId: { not: null } }],
  } as const;

  const [conversations, messages, summaries, handoffs, usageLogs] = await Promise.all([
    prisma.conversation.count({ where: { tenantId: tenant.id } }),
    prisma.message.count({ where: { tenantId: tenant.id } }),
    prisma.conversationSummary.count({ where: { tenantId: tenant.id } }),
    prisma.humanHandoff.count({ where: { tenantId: tenant.id } }),
    prisma.aiUsageLog.count({ where: usageLogWhere }),
  ]);

  console.log(`Tenant: ${tenant.name}  (slug: ${tenant.slug}, id: ${tenant.id})`);
  console.log('Would delete:');
  console.log(`  ${conversations} conversation(s)`);
  console.log(`  ${messages} message(s)`);
  console.log(`  ${summaries} conversation summary/summaries`);
  console.log(`  ${handoffs} human handoff(s)`);
  console.log(`  ${usageLogs} conversation-linked AI usage log(s)`);

  if (conversations === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  if (!confirm) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with --confirm to delete:');
    console.log(
      `  pnpm --filter @ai-employee/api exec ts-node --transpile-only scripts/delete-conversations.ts ${
        ref ?? tenant.slug
      } --confirm`,
    );
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedUsageLogs = await tx.aiUsageLog.deleteMany({ where: usageLogWhere });
    // Messages, summaries and handoffs are removed by ON DELETE CASCADE.
    const deletedConversations = await tx.conversation.deleteMany({ where: { tenantId: tenant.id } });
    return { deletedUsageLogs: deletedUsageLogs.count, deletedConversations: deletedConversations.count };
  });

  console.log(
    `\n✔ Deleted ${result.deletedConversations} conversation(s) and ${result.deletedUsageLogs} AI usage log(s) for "${tenant.name}". Messages, summaries and handoffs cascaded.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

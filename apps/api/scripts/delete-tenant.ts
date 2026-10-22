/**
 * Permanently deletes one tenant (business) and all of its data — e.g. to
 * remove leftover demo data, or to honour a business's right-to-erasure
 * request. Users who belong to no other tenant and are not platform admins are
 * deleted too.
 *
 * Dry run (default) prints what would be removed:
 *   pnpm --filter @ai-employee/api exec ts-node --transpile-only scripts/delete-tenant.ts --slug acme-salon
 * Delete for real:
 *   ... scripts/delete-tenant.ts --slug acme-salon --confirm acme-salon
 *
 * `--confirm` must repeat the slug, so a copy-pasted command can't delete the wrong business.
 */
import { PrismaClient } from '@prisma/client';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg('slug');
  if (!slug) throw new Error('Usage: delete-tenant.ts --slug <tenant-slug> [--confirm <tenant-slug>]');
  const confirmed = arg('confirm') === slug;

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new Error(`No tenant with slug "${slug}".`);
    const t = tenant.id;

    const [customers, conversations, messages, employees, tasks, documents, integrations, channels, members] = await Promise.all([
      prisma.customer.count({ where: { tenantId: t } }),
      prisma.conversation.count({ where: { tenantId: t } }),
      prisma.message.count({ where: { tenantId: t } }),
      prisma.aiEmployee.count({ where: { tenantId: t } }),
      prisma.aiTask.count({ where: { tenantId: t } }),
      prisma.document.count({ where: { tenantId: t } }),
      prisma.integration.count({ where: { tenantId: t } }),
      prisma.channel.count({ where: { tenantId: t } }),
      prisma.tenantMembership.findMany({ where: { tenantId: t }, include: { user: { include: { memberships: true } } } }),
    ]);
    const orphanUsers = members
      .map((m) => m.user)
      .filter((u) => u.platformRole === 'NONE' && u.memberships.every((m) => m.tenantId === t));

    console.log(`Tenant "${tenant.name}" (${slug}, ${t}), created ${tenant.createdAt.toISOString()}`);
    console.table({ customers, conversations, messages, aiEmployees: employees, aiTasks: tasks, documents, integrations, channels, memberships: members.length });
    console.log(`Users deleted with it (no other business, not platform admins): ${orphanUsers.map((u) => u.email).join(', ') || 'none'}`);
    const kept = members.map((m) => m.user).filter((u) => !orphanUsers.includes(u));
    if (kept.length) console.log(`Users kept (other memberships or platform admin): ${kept.map((u) => u.email).join(', ')}`);

    if (!confirmed) {
      console.log(`\nDry run — nothing deleted. Re-run with --confirm ${slug} to delete permanently.`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      // AiUsageLog → Conversation/Message has no cascade; clear it first.
      await tx.aiUsageLog.deleteMany({ where: { tenantId: t } });
      await tx.tenant.delete({ where: { id: t } });
      if (orphanUsers.length) await tx.user.deleteMany({ where: { id: { in: orphanUsers.map((u) => u.id) } } });
    });
    console.log(`Deleted tenant ${slug} and ${orphanUsers.length} user(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

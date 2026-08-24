/**
 * Promotes an existing user to platform super-admin (User.platformRole).
 * Deliberately outside the HTTP API — there is no self-service or in-app way
 * to grant this, by design (see PlatformAdminGuard).
 *
 * Usage (run from repo root, with DATABASE_URL in the environment —
 * `source .env` first, or use `pnpm --filter @ai-employee/api promote-admin <email>`
 * after `./install.sh`, which already exports it):
 *
 *   pnpm --filter @ai-employee/api promote-admin owner@acme.test
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: promote-admin <email>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { platformRole: 'SUPER_ADMIN' },
    });
    console.log(`✔ ${user.email} is now a platform admin. They must log in again for it to take effect.`);
  } catch (error) {
    console.error(`Could not promote "${email}":`, error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

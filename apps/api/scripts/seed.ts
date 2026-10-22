/**
 * Production bootstrap. Creates the first platform super-admin so a fresh
 * deployment can be administered — nothing else. No demo tenants, customers,
 * employees or sample data are created: real businesses are created through
 * signup (or the platform admin console) and configure themselves.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=you@company.com \
 *   BOOTSTRAP_ADMIN_PASSWORD='a-long-unique-password' \
 *   pnpm prisma:seed
 *
 * Idempotent: an existing user is promoted to SUPER_ADMIN but their password is
 * left untouched unless BOOTSTRAP_ADMIN_RESET_PASSWORD=true.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const [firstName, ...rest] = (process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Platform Admin').split(/\s+/);
  const lastName = rest.join(' ') || '-';
  const resetPassword = process.env.BOOTSTRAP_ADMIN_RESET_PASSWORD === 'true';

  if (!email) {
    console.log('BOOTSTRAP_ADMIN_EMAIL is not set — nothing to bootstrap.');
    return;
  }
  if (!EMAIL_RE.test(email)) throw new Error(`BOOTSTRAP_ADMIN_EMAIL "${email}" is not a valid email address.`);

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const data: { platformRole: 'SUPER_ADMIN'; status: 'ACTIVE'; passwordHash?: string } = { platformRole: 'SUPER_ADMIN', status: 'ACTIVE' };
      if (resetPassword) {
        assertStrong(password);
        data.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      }
      await prisma.user.update({ where: { id: existing.id }, data });
      console.log(`Promoted existing user ${email} to SUPER_ADMIN${resetPassword ? ' and reset the password' : ''}.`);
      return;
    }

    assertStrong(password);
    await prisma.user.create({
      data: { email, firstName: firstName!, lastName, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), platformRole: 'SUPER_ADMIN', status: 'ACTIVE' },
    });
    console.log(`Created platform super-admin ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

function assertStrong(password: string) {
  if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  if (/^(password|changeme|change-me|admin)/i.test(password)) throw new Error('BOOTSTRAP_ADMIN_PASSWORD is too guessable.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

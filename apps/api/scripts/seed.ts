/**
 * Seeds two known dev accounts so a fresh clone has something to log in
 * with immediately, without hand-rolling curl calls:
 *
 *   - A platform super admin (its own "DavinLabs" tenant, since every User
 *     needs a home tenant — see docs/architecture.md's "Platform
 *     Administration & Tenant Management" section).
 *   - A salon tenant OWNER, standing in for a real customer.
 *
 * Idempotent — safe to re-run (`pnpm prisma:seed`). Re-running resets both
 * accounts' passwords/platformRole back to these known values, which is the
 * point of a dev seed script: a reproducible known state, not a one-time
 * bootstrap. Never run this against a real/production database.
 *
 * Usage: `pnpm prisma:seed` (from repo root) or
 * `pnpm --filter @ai-employee/api exec prisma db seed`.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;
const DEV_PASSWORD = 'ChangeMe123!';

const prisma = new PrismaClient();

async function seedTenantWithOwner(params: {
  tenantName: string;
  slug: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  platformRole: 'NONE' | 'SUPER_ADMIN';
}) {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: params.ownerEmail },
    update: { passwordHash, platformRole: params.platformRole },
    create: {
      email: params.ownerEmail,
      passwordHash,
      firstName: params.ownerFirstName,
      lastName: params.ownerLastName,
      platformRole: params.platformRole,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: params.slug },
    update: {},
    create: { name: params.tenantName, slug: params.slug },
  });

  const existingBusiness = await prisma.business.findFirst({ where: { tenantId: tenant.id } });
  if (!existingBusiness) {
    await prisma.business.create({ data: { tenantId: tenant.id, name: params.tenantName } });
  }

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: 'OWNER', status: 'ACTIVE' },
    create: { tenantId: tenant.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' },
  });

  return { user, tenant };
}

async function main() {
  await seedTenantWithOwner({
    tenantName: 'DavinLabs',
    slug: 'davinlabs',
    ownerEmail: 'admin@davinlabs.com',
    ownerFirstName: 'Platform',
    ownerLastName: 'Admin',
    platformRole: 'SUPER_ADMIN',
  });
  console.log(`✔ Super admin ready: admin@davinlabs.com / ${DEV_PASSWORD}`);

  await seedTenantWithOwner({
    tenantName: 'Acme Salon',
    slug: 'acme-salon',
    ownerEmail: 'owner@acme.test',
    ownerFirstName: 'Ada',
    ownerLastName: 'Owner',
    platformRole: 'NONE',
  });
  console.log(`✔ Salon owner ready: owner@acme.test / ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Seeds known dev accounts so a fresh clone has something to log in with
 * immediately, without hand-rolling curl calls:
 *
 *   - A pure platform super admin (`platform@davinlabs.com`) — no tenant, no
 *     membership. Logs straight into the standalone /admin console. This is the
 *     canonical "Platform Super Admin (full cross-tenant access)" shape.
 *   - A platform super admin who also owns a tenant (`admin@davinlabs.com`,
 *     "DavinLabs") — exercises the workspace ⇄ console cross-over.
 *   - A salon tenant OWNER, standing in for a real customer.
 *
 * Idempotent — safe to re-run (`pnpm prisma:seed`). Re-running resets the
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

/** A platform admin with no tenant of their own — lives entirely in /admin. */
async function seedPlatformAdmin(params: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);
  return prisma.user.upsert({
    where: { email: params.email },
    update: { passwordHash, platformRole: 'SUPER_ADMIN', status: 'ACTIVE' },
    create: {
      email: params.email,
      passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      platformRole: 'SUPER_ADMIN',
    },
  });
}

async function seedTenantWithOwner(params: {
  tenantName: string;
  slug: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  platformRole: 'NONE' | 'SUPER_ADMIN';
  /**
   * Locations (branches/sites) under this one workspace. Defaults to a single
   * location named after the tenant — the same default `POST /auth/signup`
   * creates. Pass several to model e.g. a salon with multiple shops: one
   * workspace, one team, many locations (NOT one tenant per branch).
   */
  locations?: string[];
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

  for (const locationName of params.locations ?? [params.tenantName]) {
    const existing = await prisma.business.findFirst({
      where: { tenantId: tenant.id, name: locationName },
    });
    if (!existing) {
      await prisma.business.create({ data: { tenantId: tenant.id, name: locationName } });
    }
  }

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: 'OWNER', status: 'ACTIVE' },
    create: { tenantId: tenant.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' },
  });

  return { user, tenant };
}

async function main() {
  await seedPlatformAdmin({
    email: 'platform@davinlabs.com',
    firstName: 'Platform',
    lastName: 'Owner',
  });
  console.log(`✔ Pure super admin ready: platform@davinlabs.com / ${DEV_PASSWORD}`);

  await seedTenantWithOwner({
    tenantName: 'DavinLabs',
    slug: 'davinlabs',
    ownerEmail: 'admin@davinlabs.com',
    ownerFirstName: 'Platform',
    ownerLastName: 'Admin',
    platformRole: 'SUPER_ADMIN',
  });
  console.log(`✔ Super admin + tenant owner ready: admin@davinlabs.com / ${DEV_PASSWORD}`);

  await seedTenantWithOwner({
    tenantName: 'Acme Salon',
    slug: 'acme-salon',
    ownerEmail: 'owner@acme.test',
    ownerFirstName: 'Ada',
    ownerLastName: 'Owner',
    platformRole: 'NONE',
    // One salon, one team, two shops — the multi-location model. Manage these
    // under the "Locations" page in the dashboard.
    locations: ['Acme Salon — Downtown', 'Acme Salon — Airport'],
  });
  console.log(`✔ Salon owner ready: owner@acme.test / ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

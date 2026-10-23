import { test as setup, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { ADMIN, ADMIN_STATE, API_URL, OWNER, OWNER_STATE, loginViaUi, testDatabaseUrl } from "./helpers";

async function ensureUser(u: { email: string; password: string; firstName: string; lastName: string }, tenantName: string) {
  const api = await request.newContext({ baseURL: API_URL });
  const res = await api.post("/auth/signup", {
    data: { tenantName, businessType: "CUSTOM", firstName: u.firstName, lastName: u.lastName, email: u.email, password: u.password },
  });
  expect([200, 201], await res.text()).toContain(res.status());
  await api.dispose();
}

setup("create test accounts and log in", async ({ browser }) => {
  const url = testDatabaseUrl();
  const db = url.split("?")[0]!.split("/").pop()!;
  if (!db.endsWith("_test")) throw new Error(`Refusing to seed "${db}": not a test database.`);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  // Accounts persist between runs; only create the ones that are missing.
  for (const [u, tenant] of [[OWNER, OWNER.business], [ADMIN, "E2E Admin Workspace"]] as const) {
    if (!(await prisma.user.findUnique({ where: { email: u.email } }))) await ensureUser(u, tenant);
  }
  // Remove leftovers from an interrupted run so every run starts the same.
  await prisma.business.deleteMany({ where: { name: { startsWith: "Kandy Branch" } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "e2e-staff-" } } });
  // Businesses made by the sign-up tests on earlier runs.
  const signupEmails = ["e2e-signup-", "e2e-amal-", "e2e-si-"].map((p) => ({ email: { startsWith: p } }));
  await prisma.tenant.deleteMany({ where: { memberships: { some: { user: { OR: signupEmails } } } } });
  await prisma.user.deleteMany({ where: { OR: signupEmails } });
  const owned = await prisma.tenant.findUnique({ where: { slug: "e2e-test-salon" } });
  if (owned) {
    await prisma.tenant.update({ where: { id: owned.id }, data: { name: OWNER.business } });
    await prisma.business.updateMany({ where: { tenantId: owned.id }, data: { name: OWNER.business } });
    // Reply engine starts clean: Hybrid, no saved answers, no test chats.
    await prisma.tenant.update({ where: { id: owned.id }, data: { replyMode: "HYBRID" } });
    await prisma.savedAnswer.deleteMany({ where: { tenantId: owned.id } });
    await prisma.conversation.deleteMany({ where: { tenantId: owned.id } });
    await prisma.customer.deleteMany({ where: { tenantId: owned.id } });
    await prisma.channel.deleteMany({ where: { tenantId: owned.id, name: "E2E Website" } });
  }
  await prisma.planSettings.deleteMany({ where: { planId: "free" } });
  await prisma.user.update({ where: { email: ADMIN.email }, data: { platformRole: "SUPER_ADMIN" } });
  await prisma.$disconnect();

  for (const [user, file] of [[OWNER, OWNER_STATE], [ADMIN, ADMIN_STATE]] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaUi(page, user.email, user.password);
    await page.waitForURL(/\/(dashboard|onboarding|admin)/);
    await context.storageState({ path: file });
    await context.close();
  }
});

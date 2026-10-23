import { test as setup, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { ADMIN, ADMIN_STATE, API_URL, OWNER, OWNER_STATE, loginViaUi } from "./helpers";

/** Same rule as the API test harness: only ever touch a *_test database. */
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const fs = require("node:fs") as typeof import("node:fs");
  const env = fs.readFileSync(require("node:path").resolve(__dirname, "../../../.env"), "utf8");
  const base = (env.match(/^DATABASE_URL=(.*)$/m)?.[1] ?? "").replace(/["']/g, "").split("?")[0]!;
  return `${base.slice(0, base.lastIndexOf("/"))}/ai_employee_test?schema=public`;
}

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
  const owned = await prisma.tenant.findUnique({ where: { slug: "e2e-test-salon" } });
  if (owned) {
    await prisma.tenant.update({ where: { id: owned.id }, data: { name: OWNER.business } });
    await prisma.business.updateMany({ where: { tenantId: owned.id }, data: { name: OWNER.business } });
  }
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

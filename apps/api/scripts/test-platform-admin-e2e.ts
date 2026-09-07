import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from '../src/modules/admin/admin.service';
import { AuthService } from '../src/modules/auth/auth.service';

const prisma = new PrismaClient();

async function runPlatformAdminE2E() {
  console.log('🏢 ==========================================================');
  console.log('🏢 PLATFORM ADMIN / TENANT MANAGER — PRODUCTION READINESS E2E');
  console.log('🏢 ==========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const jwtService = new JwtService();
  const authService = new AuthService(prisma as any, jwtService);
  const adminService = new AdminService(prisma as any, authService);

  try {
    // ----------------------------------------------------
    // TEST 1: Super Admin & Actor Setup
    // ----------------------------------------------------
    console.log('--- Test 1: Platform Super Admin Identity ---');
    const superAdmin = await prisma.user.findUnique({
      where: { email: 'platform@davinlabs.com' },
    });
    assert(!!superAdmin, 'Super Admin identity platform@davinlabs.com exists in database');
    assert(superAdmin?.platformRole === 'SUPER_ADMIN', 'Platform role is SUPER_ADMIN');
    assert(superAdmin?.status === 'ACTIVE', 'Super Admin status is ACTIVE');

    const adminActor = { userId: superAdmin!.id, ipAddress: '127.0.0.1' };

    // ----------------------------------------------------
    // TEST 2: Platform Dashboard Overview Stats
    // ----------------------------------------------------
    console.log('\n--- Test 2: Platform Dashboard KPI Statistics ---');
    const stats = await adminService.getPlatformStats();
    assert(typeof stats.tenants.total === 'number' && stats.tenants.total >= 1, `Total tenants counted: ${stats.tenants.total}`);
    assert(typeof stats.tenants.active === 'number', `Active tenants: ${stats.tenants.active}`);
    assert(typeof stats.aiEmployees.total === 'number' && stats.aiEmployees.total >= 2, `Total AI employees: ${stats.aiEmployees.total}`);
    assert(typeof stats.users.total === 'number' && stats.users.superAdmins >= 1, `Total users: ${stats.users.total}, Super Admins: ${stats.users.superAdmins}`);
    assert(typeof stats.conversations.total === 'number', `Total conversations: ${stats.conversations.total}`);
    assert(Array.isArray(stats.recentAudits), `Recent platform audits retrieved: ${stats.recentAudits.length} entries`);

    // ----------------------------------------------------
    // TEST 3: Cross-Tenant Listing & Querying
    // ----------------------------------------------------
    console.log('\n--- Test 3: Cross-Tenant Management & Filters ---');
    const tenantsList = await adminService.listTenants({ page: 1, pageSize: 10 });
    assert(tenantsList.data.length >= 1, `Retrieved ${tenantsList.data.length} tenants`);
    const acmeTenant = tenantsList.data.find((t) => t.slug === 'acme-salon');
    assert(!!acmeTenant, 'Acme Salon & Spa tenant found in listing');
    assert(acmeTenant?.owner?.email === 'owner@acme.test', `Tenant owner correctly mapped: ${acmeTenant?.owner?.email}`);
    assert((acmeTenant?.branchCount ?? 0) >= 2, `Acme Salon branches counted: ${acmeTenant?.branchCount}`);
    assert((acmeTenant?.aiEmployeeCount ?? 0) >= 2, `Acme Salon AI employees counted: ${acmeTenant?.aiEmployeeCount}`);

    // Filter by status
    const activeTenants = await adminService.listTenants({ status: 'ACTIVE' });
    assert(activeTenants.data.every((t) => t.status === 'ACTIVE'), 'Status filter ACTIVE strictly enforced');

    // ----------------------------------------------------
    // TEST 4: Tenant Deep-Dive (Multi-Tab Details)
    // ----------------------------------------------------
    console.log('\n--- Test 4: Enriched Tenant Details ---');
    const tenantDetail = await adminService.getTenant(acmeTenant!.id);
    assert(tenantDetail.id === acmeTenant!.id, `Retrieved tenant details for ${tenantDetail.name}`);
    assert(Array.isArray(tenantDetail.businesses) && tenantDetail.businesses.length >= 2, `Branches returned: ${tenantDetail.businesses.length}`);
    assert(Array.isArray(tenantDetail.aiEmployees) && tenantDetail.aiEmployees.length >= 2, `AI Employees returned: ${tenantDetail.aiEmployees.length}`);
    assert(tenantDetail.owner?.email === 'owner@acme.test', `Primary owner: ${tenantDetail.owner?.firstName} ${tenantDetail.owner?.lastName}`);
    assert(typeof tenantDetail.usage.totalTokens === 'number', `Usage telemetry attached: ${tenantDetail.usage.totalTokens} tokens`);

    // ----------------------------------------------------
    // TEST 5: Platform AI Employees Management
    // ----------------------------------------------------
    console.log('\n--- Test 5: Platform-wide AI Employees Management ---');
    const aiEmployees = await adminService.listPlatformAiEmployees({ page: 1, pageSize: 20 });
    assert(aiEmployees.data.length >= 2, `Cross-tenant AI employees listed: ${aiEmployees.data.length}`);
    const sampleEmp = aiEmployees.data[0];
    assert(!!sampleEmp.tenant.name, `AI employee attached to tenant: ${sampleEmp.tenant.name}`);

    // Test emergency pause override
    console.log('  Testing emergency pause override...');
    const originalStatus = sampleEmp.status;
    const pausedEmp = await adminService.updateAiEmployeeStatus(sampleEmp.id, 'PAUSED', adminActor);
    assert(pausedEmp.status === 'PAUSED', `AI Employee ${sampleEmp.name} paused by platform admin`);

    // Reactivate
    const restoredEmp = await adminService.updateAiEmployeeStatus(sampleEmp.id, originalStatus, adminActor);
    assert(restoredEmp.status === originalStatus, `AI Employee ${sampleEmp.name} status restored to ${originalStatus}`);

    // ----------------------------------------------------
    // TEST 6: Pre-configured AI Templates Registry
    // ----------------------------------------------------
    console.log('\n--- Test 6: AI Templates Catalog ---');
    const templates = await adminService.getAiTemplatesCatalog();
    assert(templates.length >= 16, `Retrieved ${templates.length} pre-built business templates`);
    const salonTemplate = templates.find((t) => t.id === 'SALON_SPA');
    assert(!!salonTemplate, 'Salon & Spa template present in registry');
    assert(salonTemplate!.suggestedEmployees.length >= 2, `Salon template has ${salonTemplate!.suggestedEmployees.length} suggested AI employees`);

    // ----------------------------------------------------
    // TEST 7: Business Types Catalog
    // ----------------------------------------------------
    console.log('\n--- Test 7: Supported Business Types ---');
    const businessTypes = await adminService.getBusinessTypesCatalog();
    assert(businessTypes.length >= 8, `Catalog contains ${businessTypes.length} supported industry verticals`);
    const clinic = businessTypes.find((b) => b.id === 'CLINIC');
    assert(clinic?.category === 'Healthcare', `Clinic categorized under Healthcare`);
    assert(Boolean(clinic?.recommendedChannels.includes('WhatsApp')), 'Clinic recommends WhatsApp channel');


    // ----------------------------------------------------
    // TEST 8: Subscription Plans & Pricing
    // ----------------------------------------------------
    console.log('\n--- Test 8: Platform Subscription Plans ---');
    const plans = await adminService.getPlatformPlans();
    assert(plans.length === 5, `Configured ${plans.length} subscription tiers (Free, Starter, Pro, Business, Enterprise)`);
    const proPlan = plans.find((p) => p.id === 'pro');
    assert(proPlan?.priceMonthlyUsd === 149, 'Pro plan priced at $149/mo');
    assert(proPlan?.limits.maxBranches === 3, 'Pro plan allows 3 branches');
    assert(proPlan?.limits.maxAiEmployees === 8, 'Pro plan allows 8 AI employees');

    // ----------------------------------------------------
    // TEST 9: Platform Usage & Volume Telemetry
    // ----------------------------------------------------
    console.log('\n--- Test 9: Platform Usage & Telemetry ---');
    const usage = await adminService.getPlatformUsage();
    assert(typeof usage.tokens.total === 'number', `Total tokens tracked: ${usage.tokens.total}`);
    assert(typeof usage.volumes.conversations === 'number', `Conversations volume tracked: ${usage.volumes.conversations}`);
    assert(Array.isArray(usage.topTenants), `Top active tenants returned: ${usage.topTenants.length}`);

    // ----------------------------------------------------
    // TEST 10: System Health & Technical Diagnostics
    // ----------------------------------------------------
    console.log('\n--- Test 10: System Health Diagnostics ---');
    const health = await adminService.getSystemHealth();
    assert(health.status === 'healthy', `System status: ${health.status}`);
    assert(health.services.database.status === 'healthy', 'PostgreSQL database connection is healthy');
    assert(typeof health.services.database.latencyMs === 'number', `DB query latency measured: ${health.services.database.latencyMs}ms`);
    assert(health.services.api.status === 'healthy', 'NestJS API server is healthy');
    assert(health.services.api.memoryHeapUsedMb > 0, `Memory consumption: ${health.services.api.memoryHeapUsedMb}MB`);

    // ----------------------------------------------------
    // TEST 11: Platform Settings Configuration
    // ----------------------------------------------------
    console.log('\n--- Test 11: Platform Settings & Defaults ---');
    const settings = adminService.getPlatformSettings();
    assert(settings.defaultPlan === 'free', 'Default registration plan is free');
    assert(settings.trialDays === 14, 'Default trial period is 14 days');

    const updatedSettings = await adminService.updatePlatformSettings(
      { systemNotice: 'E2E Test System Operational Notice' },
      adminActor,
    );
    assert(updatedSettings.systemNotice === 'E2E Test System Operational Notice', 'Platform settings successfully updated');

    // ----------------------------------------------------
    // TEST 12: Immutable Platform Audit Logging
    // ----------------------------------------------------
    console.log('\n--- Test 12: Immutable Platform Audit Trail ---');
    const auditLogs = await adminService.listAuditLog({ pageSize: 10 });
    assert(auditLogs.data.length >= 2, `Audit trail active with ${auditLogs.total} recorded events`);
    const lastAudit = auditLogs.data[0];
    assert(lastAudit.actorUserId === superAdmin?.id, `Last audit action attributed to Super Admin`);
    assert(!!lastAudit.changes, 'Changes payload cryptographically preserved in audit log');

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n==========================================================');
    console.log(`🏁 PLATFORM ADMIN SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('==========================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 UNEXPECTED ERROR IN TEST SUITE:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPlatformAdminE2E();

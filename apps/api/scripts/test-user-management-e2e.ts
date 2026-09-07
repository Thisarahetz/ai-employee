import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserService } from '../src/modules/user/user.service';
import { AuditLogService } from '../src/modules/audit-log/audit-log.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { ConversationService } from '../src/modules/conversation/conversation.service';
import { JwtService } from '@nestjs/jwt';
import { EventService } from '../src/events/event.service';
import { MessageService } from '../src/modules/message/message.service';

const prisma = new PrismaClient();

async function runUserManagementE2E() {
  console.log('👥 ========================================================');
  console.log('👥 USER MANAGEMENT SYSTEM — PRODUCTION READINESS E2E TESTS');
  console.log('👥 ========================================================\n');

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
  const auditLogService = new AuditLogService(prisma as any);
  const userService = new UserService(prisma as any, auditLogService);
  const eventService = new EventService(prisma as any, { emit: () => {} } as any);
  const messageService = new MessageService(prisma as any);
  const conversationService = new ConversationService(prisma as any, eventService, messageService);
  const authService = new AuthService(prisma as any, jwtService);


  const timestamp = Date.now();
  let testTenant: any;
  let ownerUser: any;
  let ownerMembership: any;
  let branchColombo: any;
  let branchKandy: any;

  try {
    // ----------------------------------------------------
    // SETUP: Create isolated business with Owner and 2 Branches
    // ----------------------------------------------------
    console.log('--- Setup: Test Workspace & Branches ---');
    const passwordHash = await bcrypt.hash('SecurePassword123!', 10);

    const setupResult = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: `Apex Retailers ${timestamp}`,
          slug: `apex-retail-${timestamp}`,
          status: 'ACTIVE',
        },
      });

      const colombo = await tx.business.create({
        data: {
          tenantId: tenant.id,
          name: 'Colombo Branch',
          type: 'SALON',
        },
      });

      const kandy = await tx.business.create({
        data: {
          tenantId: tenant.id,
          name: 'Kandy Branch',
          type: 'SALON',
        },
      });

      const owner = await tx.user.create({
        data: {
          email: `owner_${timestamp}@apex.test`,
          passwordHash,
          firstName: 'Sarah',
          lastName: 'Jenkins',
          phone: '+94 77 111 2233',
        },
      });

      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          role: 'OWNER',
          status: 'ACTIVE',
          jobTitle: 'Business Owner',
          businessRole: 'OWNER',
          accessLevel: 'FULL',
          permissions: ['*'],
          allLocations: true,
        },
      });

      return { tenant, owner, membership, colombo, kandy };
    });

    testTenant = setupResult.tenant;
    ownerUser = setupResult.owner;
    ownerMembership = setupResult.membership;
    branchColombo = setupResult.colombo;
    branchKandy = setupResult.kandy;

    assert(Boolean(testTenant.id), 'Created test workspace Apex Retailers');
    assert(Boolean(branchColombo.id && branchKandy.id), 'Created Colombo and Kandy branches');

    // ----------------------------------------------------
    // TEST 0: Role Templates Registry
    // ----------------------------------------------------
    console.log('\n--- Test 0: Predefined Role Templates Registry ---');
    const roleCatalog = await userService.getRoleTemplates(testTenant.id);
    assert(roleCatalog.templates.length >= 5, `Retrieved ${roleCatalog.templates.length} industry role templates`);
    assert(roleCatalog.categories.length === 7, 'Permission catalogue includes all 7 business areas');
    assert(Boolean(roleCatalog.accessLevelPresets.STANDARD), 'Access level presets include STANDARD');

    // ----------------------------------------------------
    // SCENARIO 1: Small Shop — Owner adds Cashier
    // ----------------------------------------------------
    console.log('\n--- Scenario 1: Small Shop (Cashier Access & Restrictions) ---');
    const cashierInvite = await userService.invite(
      testTenant.id,
      {
        firstName: 'Kamal',
        lastName: 'Silva',
        email: `cashier_${timestamp}@apex.test`,
        phone: '+94 71 222 3344',
        role: 'EMPLOYEE',
        businessRole: 'CASHIER',
        jobTitle: 'Store Cashier',
        accessLevel: 'LIMITED',
        allLocations: true,
      },
      { userId: ownerUser.id, role: 'OWNER' },
    );

    assert(Boolean(cashierInvite.membership.id), 'Owner successfully invited Cashier');
    assert(Boolean(cashierInvite.temporaryPassword), 'Generated one-time temporary password for new employee');
    assert(cashierInvite.membership.accessLevel === 'LIMITED', 'Cashier assigned LIMITED access preset');

    // Verify Cashier permissions include sales:create and sales:view, but NOT settings or users
    const cashierPerms = cashierInvite.membership.permissions;
    assert(cashierPerms.includes('sales:create'), 'Cashier can process sales/checkouts');
    assert(!cashierPerms.includes('tenant:write'), 'Cashier is strictly restricted from business settings');
    assert(!cashierPerms.includes('users:write'), 'Cashier is strictly restricted from user management');

    // ----------------------------------------------------
    // SCENARIO 2: Medium Business — Manager adds Sales Staff
    // ----------------------------------------------------
    console.log('\n--- Scenario 2: Medium Business (Manager Adds Sales Staff) ---');
    // First, Owner adds a Store Manager
    const managerInvite = await userService.invite(
      testTenant.id,
      {
        firstName: 'Nimal',
        lastName: 'Perera',
        email: `manager_${timestamp}@apex.test`,
        role: 'MANAGER',
        businessRole: 'MANAGER',
        jobTitle: 'Store Manager',
        accessLevel: 'MANAGER',
        allLocations: true,
      },
      { userId: ownerUser.id, role: 'OWNER' },
    );
    const managerMembership = managerInvite.membership;
    assert(managerMembership.role === 'MANAGER', 'Store Manager invited with MANAGER role');

    // Now Manager invites a Sales Staff member (Allowed)
    const salesInvite = await userService.invite(
      testTenant.id,
      {
        firstName: 'Ruwan',
        lastName: 'Fernando',
        email: `sales_${timestamp}@apex.test`,
        role: 'EMPLOYEE',
        businessRole: 'SALES',
        jobTitle: 'Sales Associate',
        accessLevel: 'STANDARD',
        allLocations: true,
      },
      { userId: managerMembership.userId, role: 'MANAGER' },
    );
    assert(salesInvite.membership.role === 'EMPLOYEE', 'Manager successfully added Sales Associate');

    // Manager attempts to invite an ADMIN (Forbidden)
    let managerAdminBlocked = false;
    try {
      await userService.invite(
        testTenant.id,
        {
          firstName: 'Evil',
          lastName: 'Admin',
          email: `evil_${timestamp}@apex.test`,
          role: 'ADMIN',
        },
        { userId: managerMembership.userId, role: 'MANAGER' },
      );
    } catch (e: any) {
      managerAdminBlocked = e.status === 403 || e.message.includes('Managers can only invite');
    }
    assert(managerAdminBlocked, 'Manager was blocked from inviting an ADMIN user');

    // ----------------------------------------------------
    // SCENARIO 3: Multi-Branch — Branch Isolation Enforced
    // ----------------------------------------------------
    console.log('\n--- Scenario 3: Multi-Branch (Colombo vs Kandy Isolation) ---');
    // Add employee assigned strictly to Colombo Branch
    const colomboStaffInvite = await userService.invite(
      testTenant.id,
      {
        firstName: 'Saman',
        lastName: 'Colombo',
        email: `colombo_staff_${timestamp}@apex.test`,
        role: 'EMPLOYEE',
        businessRole: 'SALES',
        allLocations: false,
        locationIds: [branchColombo.id],
      },
      { userId: ownerUser.id, role: 'OWNER' },
    );
    const colomboStaff = colomboStaffInvite.membership;
    assert(!colomboStaff.allLocations, 'Employee assigned to restricted branch access');
    assert(colomboStaff.locationIds.includes(branchColombo.id), 'Employee authorized for Colombo Branch');

    // Create a customer and channel for 2 conversations: one for Colombo, one for Kandy
    const customer = await prisma.customer.create({
      data: {
        tenantId: testTenant.id,
        name: 'Test Client',
      },
    });

    const channel = await prisma.channel.create({
      data: {
        tenantId: testTenant.id,
        name: 'Test Web Chat',
        type: 'WEBSITE_CHAT',
      },
    });

    const convColombo = await prisma.conversation.create({
      data: {
        tenantId: testTenant.id,
        businessId: branchColombo.id,
        channelId: channel.id,
        customerId: customer.id,
        status: 'OPEN',
      },
    });

    const convKandy = await prisma.conversation.create({
      data: {
        tenantId: testTenant.id,
        businessId: branchKandy.id,
        channelId: channel.id,
        customerId: customer.id,
        status: 'OPEN',
      },
    });

    // 1. Colombo staff queries Colombo conversation -> Allowed
    const colomboResult = await conversationService.get(testTenant.id, convColombo.id, {
      allLocations: colomboStaff.allLocations,
      locationIds: colomboStaff.locationIds,
    });
    assert(colomboResult.id === convColombo.id, 'Colombo staff can access Colombo Branch conversation');

    // 2. Colombo staff attempts to query Kandy conversation -> Blocked by backend
    let kandyBlocked = false;
    try {
      await conversationService.get(testTenant.id, convKandy.id, {
        allLocations: colomboStaff.allLocations,
        locationIds: colomboStaff.locationIds,
      });
    } catch (e: any) {
      kandyBlocked = e.status === 403 || e.message.includes('do not have access');
    }
    assert(kandyBlocked, 'Backend blocked Colombo staff from accessing Kandy Branch conversation');

    // 3. Colombo staff lists conversations with query.businessId = Kandy -> Blocked
    let listKandyBlocked = false;
    try {
      await conversationService.list(testTenant.id, { businessId: branchKandy.id }, {
        allLocations: colomboStaff.allLocations,
        locationIds: colomboStaff.locationIds,
      });
    } catch (e: any) {
      listKandyBlocked = e.status === 403 || e.message.includes('do not have access');
    }
    assert(listKandyBlocked, 'Backend blocked Colombo staff from listing conversations for Kandy Branch');

    // ----------------------------------------------------
    // SCENARIO 4: Employee Leaves — Account Disabling & History
    // ----------------------------------------------------
    console.log('\n--- Scenario 4: Employee Leaves (Disable & Data Retention) ---');
    // Owner disables the Cashier
    const disabledCashier = await userService.update(
      testTenant.id,
      cashierInvite.membership.id,
      { status: 'DISABLED' },
      { userId: ownerUser.id, role: 'OWNER' },
    );
    assert(disabledCashier.status === 'DISABLED', 'Cashier account disabled by owner');

    // Verify Cashier cannot log in with disabled membership
    let cashierLoginBlocked = false;
    try {
      await authService.login({
        email: `cashier_${timestamp}@apex.test`,
        password: cashierInvite.temporaryPassword!,
      });
    } catch (e: any) {
      cashierLoginBlocked = e.status === 401 || e.message.includes('disabled') || e.message.includes('Invalid credentials');
    }
    assert(cashierLoginBlocked, 'Disabled employee is rejected at login');

    // Verify user record and transaction history remain in database
    const preservedUser = await prisma.user.findUnique({
      where: { email: `cashier_${timestamp}@apex.test` },
    });
    assert(Boolean(preservedUser), 'Historical employee record preserved in database');

    // ----------------------------------------------------
    // SCENARIO 5: Manager Security — Manager cannot Demote/Remove Owner
    // ----------------------------------------------------
    console.log('\n--- Scenario 5: Manager Security (Ownership Protection) ---');
    // Manager attempts to disable Owner
    let demoteOwnerBlocked = false;
    try {
      await userService.update(
        testTenant.id,
        ownerMembership.id,
        { status: 'DISABLED' },
        { userId: managerMembership.userId, role: 'MANAGER' },
      );
    } catch (e: any) {
      demoteOwnerBlocked = e.status === 403 || e.message.includes('Only a business owner');
    }
    assert(demoteOwnerBlocked, 'Manager was blocked from disabling the Business Owner');

    // Manager attempts to remove Owner
    let removeOwnerBlocked = false;
    try {
      await userService.remove(
        testTenant.id,
        ownerMembership.id,
        { userId: managerMembership.userId, role: 'MANAGER' },
      );
    } catch (e: any) {
      removeOwnerBlocked = e.status === 403 || e.message.includes('Only a business owner');
    }
    assert(removeOwnerBlocked, 'Manager was blocked from removing the Business Owner');

    // Owner attempts to disable themselves (Last owner guard)
    let lastOwnerGuardTriggered = false;
    try {
      await userService.update(
        testTenant.id,
        ownerMembership.id,
        { status: 'DISABLED' },
        { userId: ownerUser.id, role: 'OWNER' },
      );
    } catch (e: any) {
      lastOwnerGuardTriggered = e.status === 400 || e.message.includes('always have at least one active owner');
    }
    assert(lastOwnerGuardTriggered, 'System prevented disabling the only active business owner');

    // ----------------------------------------------------
    // SCENARIO 6: Audit Activity Logging
    // ----------------------------------------------------
    console.log('\n--- Scenario 6: Human-Readable Audit Logging ---');
    const auditLogs = await prisma.auditLog.findMany({
      where: { tenantId: testTenant.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(auditLogs.length >= 3, `Recorded ${auditLogs.length} audit trail events`);
    const sampleLog = auditLogs[0];
    const logSummary = (sampleLog.changes as any)?.summary || '';
    assert(logSummary.length > 0, `Human-readable activity summary recorded: "${logSummary}"`);

    // Clean up created test data
    console.log('\n--- Cleanup: Deleting Test Workspace ---');
    await prisma.tenant.delete({ where: { id: testTenant.id } });
    console.log('  ✅ PASS: Test workspace cleaned up cleanly');
    passed++;

  } catch (error) {
    console.error('Test run failed unexpectedly:', error);
    failed++;
  }

  console.log('\n========================================================');
  console.log(`USER MANAGEMENT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runUserManagementE2E().catch((err) => {
  console.error(err);
  process.exit(1);
});

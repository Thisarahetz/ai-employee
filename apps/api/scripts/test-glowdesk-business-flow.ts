import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AiEmployeeService } from '../src/modules/ai-employee/ai-employee.service';
import { AiEmployeeApprovalService } from '../src/modules/ai-employee/ai-employee-approval.service';
import { AiEmployeeActivityService } from '../src/modules/ai-employee/ai-employee-activity.service';

const prisma = new PrismaClient();

async function testGlowDeskOwnerFlow() {
  console.log('💇 ========================================================');
  console.log('💇 GLOWDESK SALON & SPA — REAL-WORLD BUSINESS OWNER E2E TEST');
  console.log('💇 ========================================================\n');

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

  try {
    const testEmail = `owner_${Date.now()}@glowdesk.test`;
    const passwordHash = await bcrypt.hash('ChangeMe123!', 10);

    // ----------------------------------------------------
    // STEP 1: REGISTRATION (MINIMAL: NAME, EMAIL, PASSWORD)
    // ----------------------------------------------------
    console.log('--- Step 1: Owner Registration (Frictionless) ---');
    const { user, tenant } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: "GlowDesk Salon & Spa",
          slug: `glowdesk-salon-${Date.now()}`,
          status: 'ACTIVE',
        },
      });

      const business = await tx.business.create({
        data: {
          tenantId: tenant.id,
          name: "GlowDesk Salon & Spa",
          type: 'SALON',
        },
      });

      const user = await tx.user.create({
        data: {
          email: testEmail,
          passwordHash,
          firstName: 'Sarah',
          lastName: 'Jenkins',
        },
      });

      await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      return { user, tenant, business };
    });

    assert(!!user.id && !!tenant.id, `Account created for ${user.firstName} ${user.lastName} (${user.email})`);

    // ----------------------------------------------------
    // STEP 2: BUSINESS & ONBOARDING TEMPLATE DEPLOYMENT
    // ----------------------------------------------------
    console.log('\n--- Step 2: Auto-Configuring AI Employees for Salon & Spa ---');
    const activityService = new AiEmployeeActivityService(prisma as any);
    const mockNotificationService = { notify: async () => {} } as any;
    const mockAuditLogService = { record: async () => {} } as any;
    const approvalService = new AiEmployeeApprovalService(
      prisma as any,
      mockNotificationService,
      mockAuditLogService
    );
    const employeeService = new AiEmployeeService(prisma as any);

    // Deploy SALON_SPA template with its pre-configured employees
    const deployment = await employeeService.applyTemplate(
      tenant.id,
      'SALON_SPA',
      'SMALL',
      ['receptionist', 'marketing']
    );

    assert(deployment.installedCount >= 2, `Hired ${deployment.installedCount} AI employees for GlowDesk`);

    const hiredStaff = await employeeService.listEmployees(tenant.id);
    const receptionist = hiredStaff.find((e) => e.role.includes('Receptionist') || e.department === 'Customer Support');
    const marketingSpecialist = hiredStaff.find((e) => e.role.includes('Marketing') || e.department === 'Marketing');

    assert(!!receptionist, `AI Front-Desk Receptionist is active (ID: ${receptionist?.id})`);
    assert(!!marketingSpecialist, `AI Client Retention & Marketing is active (ID: ${marketingSpecialist?.id})`);

    // ----------------------------------------------------
    // STEP 3: DASHBOARD OPERATIONAL CHECKS
    // ----------------------------------------------------
    console.log('\n--- Step 3: Checking Business Dashboard Metrics & Live Status ---');
    const stats = await employeeService.getStats(tenant.id);
    assert(stats.active >= 2, `Dashboard reports ${stats.active} AI employees active and working`);

    // ----------------------------------------------------
    // STEP 4: "NEEDS YOUR ATTENTION" APPROVALS FLOW
    // ----------------------------------------------------
    console.log('\n--- Step 4: "Needs Your Attention" — Level-2 Safety Authorization ---');
    // An AI employee attempts to send out a 30% discount broadcast
    if (marketingSpecialist) {
      const actionResult = await employeeService.checkActionPermission(
        tenant.id,
        marketingSpecialist.id,
        'largeDiscount',
        '30% VIP Summer Spa Package Promotion',
        { discountPercent: 30, estimatedCostUsd: 450, clientSegment: 'VIP' }
      );

      assert(
        actionResult.allowed === false && actionResult.requiresApproval === true,
        'Level-2 safety rule blocked promotional discount from executing autonomously'
      );
      assert(!!actionResult.approvalId, `Created pending authorization card: ${actionResult.approvalId}`);

      // Owner reviews on the dashboard and clicks [Approve]
      if (actionResult.approvalId) {
        const approved = await approvalService.reviewApproval(
          tenant.id,
          actionResult.approvalId,
          user.id,
          'APPROVED',
          'Approved by Sarah Jenkins (Owner) on mobile dashboard.'
        );
        assert(approved.status === 'APPROVED', 'Owner approved the pending promotion action');
        assert(approved.reviewedByUserId === user.id, 'Approval recorded owner identity in audit log');
      }
    }

    // ----------------------------------------------------
    // STEP 5: EMERGENCY 1-CLICK PAUSE SWITCH
    // ----------------------------------------------------
    console.log('\n--- Step 5: Testing 1-Click Pause & Resume Switch ---');
    if (receptionist) {
      // Owner pauses receptionist during store maintenance
      await employeeService.toggleStatus(tenant.id, receptionist.id, 'PAUSED');
      let pausedState = await employeeService.getEmployee(tenant.id, receptionist.id);
      assert(pausedState.status === 'PAUSED', 'Receptionist paused via 1-click dashboard switch');

      // Verify AI is blocked from answering while paused
      const blockedAttempt = await employeeService.checkActionPermission(
        tenant.id,
        receptionist.id,
        'viewProducts',
        'Check Hair Treatment Prices'
      );
      assert(
        blockedAttempt.allowed === false && blockedAttempt.reason?.includes('paused'),
        'System guarantees paused AI will not answer or execute actions'
      );

      // Owner clicks Resume
      await employeeService.toggleStatus(tenant.id, receptionist.id, 'ACTIVE');
      const activeState = await employeeService.getEmployee(tenant.id, receptionist.id);
      assert(activeState.status === 'ACTIVE', 'Receptionist reactivated and ready to serve salon customers');
    }

    // ----------------------------------------------------
    // STEP 6: BUSINESS INFORMATION & RECENT ACTIVITIES
    // ----------------------------------------------------
    console.log('\n--- Step 6: Reviewing Business Activity Stream ---');
    const activities = await activityService.listActivities(tenant.id, { limit: 10 });
    assert(activities.length >= 3, `Recorded ${activities.length} clear, human-readable operational events`);
    console.log(`     Sample Activity: "${activities[0]?.action}" (${activities[0]?.details})`);

    // ----------------------------------------------------
    // STEP 7: CLEANUP
    // ----------------------------------------------------
    console.log('\n--- Step 7: Cleaning Up Test Workspace ---');
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.user.delete({ where: { id: user.id } });
    assert(true, 'Test workspace cleaned up cleanly');

  } catch (err: any) {
    console.error('💥 Test error:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
    console.log('\n========================================================');
    console.log(`GLOWDESK TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================\n');
    if (failed > 0) process.exit(1);
  }
}

testGlowDeskOwnerFlow();

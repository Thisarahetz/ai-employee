import { PrismaClient } from '@prisma/client';
import { BUSINESS_TEMPLATES } from '../src/modules/ai-employee/ai-employee-templates';
import { AiEmployeeService } from '../src/modules/ai-employee/ai-employee.service';
import { AiEmployeeApprovalService } from '../src/modules/ai-employee/ai-employee-approval.service';
import { AiEmployeeActivityService } from '../src/modules/ai-employee/ai-employee-activity.service';

const prisma = new PrismaClient();

async function runE2ETests() {
  console.log('🧪 ==========================================');
  console.log('🧪 RUNNING AI EMPLOYEE SYSTEM E2E VERIFICATION');
  console.log('🧪 ==========================================\n');

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
    // ----------------------------------------------------
    // TEST 1: TEMPLATE REGISTRY
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Business Templates Registry ---');
    const templateKeys = Object.keys(BUSINESS_TEMPLATES);
    assert(templateKeys.length >= 16, `Found ${templateKeys.length} business templates (>= 16 required)`);

    const expectedKeys = [
      'PHONE_SHOP',
      'SALON_SPA',
      'RESTAURANT_CAFE',
      'GROCERY_SUPERMARKET',
      'CLINIC_MEDICAL',
      'ECOMMERCE_RETAIL',
      'VEHICLE_SERVICE',
      'HARDWARE_SHOP',
      'HOTEL_HOSPITALITY',
      'BAKERY_CAFE',
      'CLOTHING_BOUTIQUE',
      'PHARMACY_STORE',
      'GYM_FITNESS',
      'REAL_ESTATE',
      'WHOLESALE_DISTRIBUTION',
      'GENERAL_RETAIL',
    ];

    for (const key of expectedKeys) {
      const tmpl = BUSINESS_TEMPLATES[key];
      assert(
        !!tmpl && tmpl.suggestedEmployees.length >= 1,
        `Template ${key} exists with ${tmpl?.suggestedEmployees.length ?? 0} suggested AI employees`
      );
    }

    // ----------------------------------------------------
    // TEST 2: DATABASE & TENANT CONTEXT
    // ----------------------------------------------------
    console.log('\n--- 2. Finding Test Tenant & User ---');
    let tenant = await prisma.tenant.findFirst({ where: { slug: 'acme-salon' } });
    if (!tenant) {
      tenant = await prisma.tenant.findFirst();
    }
    assert(!!tenant, `Using tenant: ${tenant?.name} (${tenant?.id})`);
    if (!tenant) throw new Error('No tenant found in database.');

    const user = await prisma.user.findFirst({
      where: { memberships: { some: { tenantId: tenant.id } } },
    });
    assert(!!user, `Using owner user: ${user?.email} (${user?.id})`);
    if (!user) throw new Error('No user found for tenant.');

    // Instantiate services
    const mockAuditLogService = { record: async () => {} } as any;
    const mockNotificationService = { notify: async () => {} } as any;

    const activityService = new AiEmployeeActivityService(prisma as any);
    const approvalService = new AiEmployeeApprovalService(
      prisma as any,
      mockNotificationService,
      mockAuditLogService,
    );
    const employeeService = new AiEmployeeService(prisma as any);

    // ----------------------------------------------------
    // TEST 3: CREATING AN AI EMPLOYEE
    // ----------------------------------------------------
    console.log('\n--- 3. Testing AI Employee Creation & Initial State ---');
    const createdEmp = await employeeService.createEmployee(tenant.id, {
      name: 'E2E Test Agent',
      role: 'Quality Assurance Specialist',
      department: 'Operations',
      businessFunction: 'Automated QA & System Check',
      description: 'Temporary agent created for production verification.',
      actionLevel: 'APPROVAL_REQUIRED',
      scope: 'ALL_BRANCHES',
      responsibilities: ['Verify APIs', 'Audit orders', 'Monitor alerts'],
      assignedTasks: [
        { category: 'OPERATIONS', task: 'Check system health', isEnabled: true },
        { category: 'SALES', task: 'Review large discounts', isEnabled: true },
      ],
      permissions: {
        viewProducts: true,
        viewPrices: true,
        editPrices: true,
        deleteProducts: false,
      },
    });

    assert(!!createdEmp.id, `Created AI Employee with ID: ${createdEmp.id}`);
    assert(createdEmp.status === 'ACTIVE', 'Initial status defaults to ACTIVE');
    assert(createdEmp.actionLevel === 'APPROVAL_REQUIRED', 'Action level set to APPROVAL_REQUIRED');

    // ----------------------------------------------------
    // TEST 4: PERMISSION CHECK ENGINE (3-LEVEL ENFORCEMENT)
    // ----------------------------------------------------
    console.log('\n--- 4. Testing 3-Level Permission Enforcement & Pause Protection ---');

    // 4A: Level 1 (Automatic) safe action (temporarily switch to AUTOMATIC to verify Level 1)
    await employeeService.updateEmployee(tenant.id, createdEmp.id, { actionLevel: 'AUTOMATIC' });
    const autoCheck = await employeeService.checkActionPermission(
      tenant.id,
      createdEmp.id,
      'viewProducts',
      'Browse Product Catalog',
      { query: 'iPhone 15 cases' }
    );
    assert(autoCheck.allowed === true, 'Level 1 Safe read action is ALLOWED automatically');

    // 4B: Level 2 (Approval Required) sensitive action (e.g. editPrices or largeDiscount)
    const approvalCheck = await employeeService.checkActionPermission(
      tenant.id,
      createdEmp.id,
      'editPrices',
      'Update Price of VIP Item',
      { productId: 'prod_123', newPrice: 49.99 }
    );
    assert(
      approvalCheck.allowed === false && approvalCheck.requiresApproval === true,
      'Level 2 Sensitive action is BLOCKED until owner approves'
    );
    assert(!!approvalCheck.approvalId, `Created pending approval request: ${approvalCheck.approvalId}`);

    // 4C: Level 3 (Owner Only) dangerous action (e.g. deleteProducts)
    const dangerousCheck = await employeeService.checkActionPermission(
      tenant.id,
      createdEmp.id,
      'deleteProducts',
      'Delete Product Catalog Item',
      { productId: 'prod_123' }
    );
    assert(
      dangerousCheck.allowed === false && dangerousCheck.reason?.includes('restricted to the business owner'),
      'Level 3 Dangerous action is STRICTLY BLOCKED for owner only'
    );

    // 4D: Emergency Pause protection
    console.log('\n--- 4D. Testing Emergency Kill-Switch (Pause) ---');
    await employeeService.toggleStatus(tenant.id, createdEmp.id, 'PAUSED');
    const pausedEmp = await employeeService.getEmployee(tenant.id, createdEmp.id);
    assert(pausedEmp.status === 'PAUSED', 'Employee successfully PAUSED');

    const pausedActionCheck = await employeeService.checkActionPermission(
      tenant.id,
      createdEmp.id,
      'viewProducts',
      'Browse Catalog'
    );
    assert(
      pausedActionCheck.allowed === false && pausedActionCheck.reason?.includes('paused'),
      'PAUSED employee is instantly blocked from executing ANY action'
    );

    // Reactivate
    await employeeService.toggleStatus(tenant.id, createdEmp.id, 'ACTIVE');
    const reactivatedEmp = await employeeService.getEmployee(tenant.id, createdEmp.id);
    assert(reactivatedEmp.status === 'ACTIVE', 'Employee reactivated successfully');

    // ----------------------------------------------------
    // TEST 5: OWNER APPROVAL WORKFLOW
    // ----------------------------------------------------
    console.log('\n--- 5. Testing Human-in-the-Loop Owner Approval Workflow ---');
    if (approvalCheck.approvalId && user) {
      const reviewed = await approvalService.reviewApproval(
        tenant.id,
        approvalCheck.approvalId,
        user.id,
        'APPROVED',
        'Approved by business owner in verification test.'
      );
      assert(reviewed.status === 'APPROVED', 'Owner approved pending request');
      assert(reviewed.reviewedByUserId === user.id, 'Reviewer ID recorded correctly');
      assert(!!reviewed.reviewedAt, 'reviewedAt timestamp recorded');
    }

    // ----------------------------------------------------
    // TEST 6: ACTIVITY TIMELINE & AUDIT LOGS
    // ----------------------------------------------------
    console.log('\n--- 6. Testing Audit Log Stream ---');
    const activities = await activityService.listActivities(tenant.id, {
      employeeId: createdEmp.id,
      limit: 10,
    });
    assert(activities.length >= 2, `Recorded ${activities.length} activity audit entries`);

    // ----------------------------------------------------
    // TEST 7: CLEANUP
    // ----------------------------------------------------
    console.log('\n--- 7. Cleanup & Deletion ---');
    await employeeService.deleteEmployee(tenant.id, createdEmp.id);
    const verifyDeleted = await prisma.aiEmployee.findUnique({ where: { id: createdEmp.id } });
    assert(!verifyDeleted, 'Deleted test employee and verified removal from database');

  } catch (err: any) {
    console.error('💥 Unhandled error in E2E tests:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
    console.log('\n==========================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==========================================\n');
    if (failed > 0) process.exit(1);
  }
}

runE2ETests();

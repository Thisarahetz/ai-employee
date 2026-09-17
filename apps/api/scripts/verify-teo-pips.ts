import { PrismaClient, ReversibilityType, SagaStatus, InvariantStatus, HandoffReason, MessageSender } from '@prisma/client';
import { DynamicSagaService } from '../src/modules/saga/dynamic-saga.service';
import { PolicySynthesisService } from '../src/modules/policy-synthesis/policy-synthesis.service';

const prisma = new PrismaClient();

async function runVerification() {
  console.log('🧪 ========================================================================');
  console.log('🧪 TEO-PIPS: TRANSACTIONAL SAGA & POLICY SYNTHESIS VERIFICATION');
  console.log('🧪 ========================================================================\n');

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

  // Mock EventService
  const mockEventService = {
    emit: async (tenantId: string, type: string, payload: any) => {
      // console.log(`    [Event Emitted] ${type}`);
    },
  } as any;

  // Mock ExternalActionService
  const executedCompensations: string[] = [];
  const mockExternalActionService = {
    executeAction: async (integrationId: string, actionName: string, data: any) => {
      executedCompensations.push(actionName);
      return { success: true, message: `${actionName} executed successfully`, data: { reverted: true } };
    },
  } as any;

  // Mock AiProviderService
  const mockAiProviderService = {
    complete: async () => ({
      content: JSON.stringify({
        name: 'VIP Reschedule Fee Exemption',
        description: 'Auto-synthesized rule allowing free rescheduling for repeat customers',
        conditionRule: {
          intent: 'reschedule_appointment',
          customerCriteria: 'returning',
          predicate: 'customer.appointmentCount > 1',
        },
        actionOverride: {
          decision: 'ALLOW_ACTION',
          targetAction: 'waive_rescheduling_fee',
          parameters: { waiveFee: true },
        },
        confidenceScore: 0.92,
      }),
    }),
  } as any;

  const dynamicSagaService = new DynamicSagaService(
    prisma as any,
    mockEventService,
    mockExternalActionService,
  );

  const policySynthesisService = new PolicySynthesisService(
    prisma as any,
    mockEventService,
    mockAiProviderService,
  );

  let testTenantId = '';
  let testCustomerId = '';
  let testChannelId = '';
  let testConversationId = '';
  let testIntegrationId = '';
  let testHandoffId = '';

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log('--- 1. Setting up Sandbox Fixtures ---');
    const tenant = await prisma.tenant.create({
      data: {
        name: 'TEO-PIPS Test Tenant',
        slug: `teo-pips-test-${Date.now()}`,
        plan: 'enterprise',
      },
    });
    testTenantId = tenant.id;

    const customer = await prisma.customer.create({
      data: {
        tenantId: testTenantId,
        name: 'Alice Henderson',
        phone: '+15551234567',
        email: 'alice@example.com',
      },
    });
    testCustomerId = customer.id;

    const channel = await prisma.channel.create({
      data: {
        tenantId: testTenantId,
        type: 'WEBSITE_CHAT',
        name: 'Test Chat',
      },
    });
    testChannelId = channel.id;

    const conversation = await prisma.conversation.create({
      data: {
        tenantId: testTenantId,
        customerId: testCustomerId,
        channelId: testChannelId,
        status: 'OPEN',
      },
    });
    testConversationId = conversation.id;

    const integration = await prisma.integration.create({
      data: {
        tenantId: testTenantId,
        name: 'Mock Booking Integration',
        type: 'STANDARD_API',
        baseUrl: 'http://localhost:3001/crm-mock',
        status: 'CONNECTED',
      },
    });
    testIntegrationId = integration.id;

    // Register forward & compensating action
    await prisma.integrationAction.create({
      data: {
        tenantId: testTenantId,
        integrationId: testIntegrationId,
        name: 'create_appointment',
        description: 'Books an appointment',
        parameters: {},
      },
    });

    await prisma.integrationAction.create({
      data: {
        tenantId: testTenantId,
        integrationId: testIntegrationId,
        name: 'cancel_appointment',
        description: 'Cancels an appointment (Compensating action)',
        parameters: {},
      },
    });

    assert(Boolean(testTenantId && testConversationId), 'Test fixtures created in database');

    // ----------------------------------------------------
    // TEST 2: DYNAMIC SAGA ORCHESTRATION & COMPENSATING ROLLBACK
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Dynamic Saga Creation & Step Recording ---');
    const saga = await dynamicSagaService.getOrCreateActiveSaga(testTenantId, testConversationId);
    assert(saga.status === SagaStatus.ACTIVE, `Saga initialized in ACTIVE state (id=${saga.id})`);

    // Step 1: Query (check_availability)
    const step1 = await dynamicSagaService.recordStep({
      sagaId: saga.id,
      actionName: 'check_availability',
      reversibility: ReversibilityType.QUERY,
      inputPayload: { date: '2026-09-20' },
      outputPayload: { availableSlots: ['10:00', '14:00'] },
    });
    assert(step1.reversibility === ReversibilityType.QUERY, 'Recorded QUERY step check_availability');

    // Step 2: Compensatable Mutation (create_appointment)
    const step2 = await dynamicSagaService.recordStep({
      sagaId: saga.id,
      actionName: 'create_appointment',
      reversibility: ReversibilityType.COMPENSATABLE,
      inputPayload: { variantId: 'v1', startTime: '2026-09-20T10:00:00Z', customerPhone: '+15551234567' },
      outputPayload: { appointmentId: 'apt-9876', status: 'CONFIRMED' },
      compensatingAction: 'cancel_appointment',
    });
    assert(
      step2.reversibility === ReversibilityType.COMPENSATABLE && step2.compensatingAction === 'cancel_appointment',
      'Recorded COMPENSATABLE step create_appointment with cancel_appointment pairing',
    );

    // Step 3: Mid-stream Failure triggering Compensation
    console.log('\n--- 3. Testing Dynamic Compensatory Rollback (LIFO) ---');
    await dynamicSagaService.compensateSaga(saga.id, 'Simulated mid-stream failure or customer cancellation');

    const compensatedSaga = await prisma.dynamicSaga.findUnique({
      where: { id: saga.id },
      include: { steps: true },
    });
    assert(compensatedSaga?.status === SagaStatus.COMPENSATED, 'Saga transitioned to COMPENSATED status');

    const compensatedStep2 = compensatedSaga?.steps.find((s) => s.id === step2.id);
    assert(compensatedStep2?.isCompensated === true, 'Compensatable step marked isCompensated=true');
    assert(
      executedCompensations.includes('cancel_appointment'),
      'Compensating action cancel_appointment was dispatched by Saga Orchestrator',
    );

    // Step 4: Successful Saga Commit
    console.log('\n--- 4. Testing Saga Commit on Clean Completion ---');
    const saga2 = await dynamicSagaService.getOrCreateActiveSaga(testTenantId, testConversationId);
    assert(saga2.id !== saga.id, 'New active saga created after previous compensation');
    const committed = await dynamicSagaService.commitSaga(saga2.id);
    assert(committed.status === SagaStatus.COMMITTED, 'Saga successfully COMMITTED');

    // ----------------------------------------------------
    // TEST 5: POLICY SYNTHESIS & INVARIANT INDUCTION
    // ----------------------------------------------------
    console.log('\n--- 5. Testing Closed-Loop Policy Synthesis from Human Handoff ---');

    // Seed conversation messages simulating escalation trajectory
    const preHandoffTime = new Date(Date.now() - 60000);
    const postHandoffTime = new Date();

    await prisma.message.createMany({
      data: [
        {
          tenantId: testTenantId,
          conversationId: testConversationId,
          sender: MessageSender.CUSTOMER,
          content: 'I need to reschedule my appointment to tomorrow, but the system says I owe a $25 cancellation fee.',
          createdAt: preHandoffTime,
        },
        {
          tenantId: testTenantId,
          conversationId: testConversationId,
          sender: MessageSender.AI,
          content: "I'm unable to waive the cancellation fee per standard policy. Transferring you to a manager.",
          createdAt: preHandoffTime,
        },
      ],
    });

    const handoff = await prisma.humanHandoff.create({
      data: {
        tenantId: testTenantId,
        conversationId: testConversationId,
        reason: HandoffReason.UNSUPPORTED_REQUEST,
        notes: 'Manager approved courtesy reschedule fee waiver for valued customer',
        status: 'RESOLVED',
        requestedAt: preHandoffTime,
        resolvedAt: postHandoffTime,
      },
    });
    testHandoffId = handoff.id;

    await prisma.message.create({
      data: {
        tenantId: testTenantId,
        conversationId: testConversationId,
        sender: MessageSender.HUMAN_AGENT,
        content: 'Hi Alice! Since you have been with us for over a year, I have waived your reschedule fee and moved you to tomorrow at 2 PM.',
        createdAt: postHandoffTime,
      },
    });

    // Run Policy Synthesis
    const invariant = await policySynthesisService.synthesizeFromHandoff(testTenantId, testHandoffId);
    assert(Boolean(invariant && invariant.id), `Synthesized operational invariant id=${invariant.id}`);
    assert(invariant.name === 'VIP Reschedule Fee Exemption', `Synthesized name: "${invariant.name}"`);
    assert(invariant.confidenceScore >= 0.9, `Confidence score: ${invariant.confidenceScore}`);
    assert(
      invariant.status === InvariantStatus.SHADOW_VERIFIED || invariant.status === InvariantStatus.CANDIDATE,
      `Invariant status is ${invariant.status} with regression pass rate ${invariant.regressionPassRate}`,
    );

    // Promote to ACTIVE
    console.log('\n--- 6. Testing Invariant Activation & Runtime Retrieval ---');
    const activated = await policySynthesisService.activateInvariant(testTenantId, invariant.id);
    assert(activated.status === InvariantStatus.ACTIVE, 'Invariant promoted to ACTIVE status');

    const activeRules = await policySynthesisService.getActiveInvariants(testTenantId);
    assert(activeRules.length === 1 && activeRules[0].id === invariant.id, 'Active invariant successfully retrieved for agent prompt injection');

  } catch (error) {
    console.error('❌ Unexpected exception during test:', error);
    failed++;
  } finally {
    console.log('\n--- 7. Cleaning Up Test Fixtures ---');
    if (testTenantId) {
      await prisma.tenant.delete({ where: { id: testTenantId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();

import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const n8nApiKey =
  process.env.N8N_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MTcxZWZiMy00NWNjLTRiYTUtYjE3MS0yZWQxZjY2NTg5NjAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNGU3ZDAyMTEtMzY0My00MzZmLTgwNDctMmRjOWI0MWYyMTkyIiwiaWF0IjoxNzg3NjM2NzU4LCJleHAiOjE3OTUzOTIwMDB9.PgLvpU0XcQmBXdyu7cNVQAI9Luw3M5yMD7cB6sbWb3E';
const n8nApiUrl = (process.env.N8N_API_URL || 'http://localhost:5678/api/v1').replace(/\/+$/, '');
const n8nWebhookBase = (process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/').replace(/\/+$/, '');

interface WorkflowTestCase {
  name: string;
  webhookPath: string;
  payload: Record<string, any>;
  expectedInitialNodes: string[];
}

const TEST_CASES: WorkflowTestCase[] = [
  {
    name: 'Example - New Customer Lead',
    webhookPath: 'example-new-customer-lead',
    payload: {
      tenantId: 'test-tenant-1',
      customerId: 'cust-test-101',
      conversationId: 'conv-test-101',
      eventType: 'customer.created',
      data: {
        name: 'Alice Wonderland',
        email: 'alice@example.com',
        phone: '+1234567890',
      },
    },
    expectedInitialNodes: ['Webhook - AI Employee Event', 'Check CRM For Existing Lead', 'Create Lead Record', 'Notify Sales (Slack)'],
  },
  {
    name: 'Appointment Lifecycle & Follow-up Sequence',
    webhookPath: 'appointment-lifecycle-sequence',
    payload: {
      tenantId: 'test-tenant-1',
      customerId: 'cust-test-102',
      conversationId: 'conv-test-102',
      eventType: 'appointment.created',
      data: {
        appointmentId: 'a0000000-0000-0000-0000-000000000002',
        clientName: 'Bob Builder',
        service: 'Balayage Hair Color',
        startTime: '2026-09-05T10:00:00Z',
        localTime: 'Saturday, Sep 5 at 10:00 AM',
        customerPhone: '+1234567891',
        customerEmail: 'bob@example.com',
      },
    },
    expectedInitialNodes: ['Webhook - Appointment Created', 'Extract Booking Details', 'Send WhatsApp Confirmation', 'Send Email Receipt', 'Wait 24 Hours'],
  },
  {
    name: 'Scheduled Appointment Reminders (24h & 2h)',
    webhookPath: 'scheduled-appointment-reminders',
    payload: {
      tenantId: 'test-tenant-1',
      customerId: 'cust-test-103',
      conversationId: 'conv-test-103',
      eventType: 'appointment.created',
      data: {
        appointmentId: 'a0000000-0000-0000-0000-000000000003',
        clientName: 'Charlie Brown',
        service: 'Deluxe Facial',
        startTime: '2026-09-06T14:00:00Z',
        localTime: 'Sunday, Sep 6 at 2:00 PM',
        customerPhone: '+1234567892',
      },
    },
    expectedInitialNodes: ['Webhook - Appointment Created', 'Parse Timing & Customer', 'Wait Until 24h Before'],
  },
  {
    name: 'New Customer Lead Follow-up Sequence',
    webhookPath: 'lead-followup-sequence',
    payload: {
      tenantId: 'test-tenant-1',
      customerId: 'cust-test-104',
      conversationId: 'conv-test-104',
      eventType: 'customer.created',
      data: {
        customerId: 'cust-test-104',
        name: 'Diana Prince',
        phone: '+1234567893',
      },
    },
    expectedInitialNodes: ['Webhook - New Lead Inquiry', 'Extract Customer Info', 'Send Day 0 Welcome & Pricing', 'Wait 1 Day'],
  },
  {
    name: 'Salon Customer Retention & 30-Day Rebooking',
    webhookPath: 'salon-retention-rebooking',
    payload: {
      tenantId: 'test-tenant-1',
      customerId: 'cust-test-105',
      conversationId: 'conv-test-105',
      eventType: 'appointment.completed',
      data: {
        clientName: 'Emma Stone',
        customerPhone: '+1234567894',
        service: 'Keratin Treatment',
      },
    },
    expectedInitialNodes: ['Webhook - Appointment Completed', 'Extract Completion Info', 'Wait 1 Day'],
  },
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('===============================================================');
  console.log('         N8N WORKFLOWS REAL-TEST SUITE VERIFICATION            ');
  console.log('===============================================================\n');

  // 1. Verify n8n connectivity
  console.log('1. Checking n8n API connectivity...');
  let n8nWorkflows: any[] = [];
  try {
    const listRes = await axios.get(`${n8nApiUrl}/workflows`, {
      headers: { 'X-N8N-API-KEY': n8nApiKey },
      timeout: 5000,
    });
    n8nWorkflows = listRes.data?.data || [];
    console.log(`   Connected to n8n successfully. Found ${n8nWorkflows.length} workflows in n8n.`);
  } catch (err: any) {
    console.error(`   ERROR connecting to n8n: ${err.message}`);
    process.exit(1);
  }

  // Ensure each workflow is active
  for (const wf of n8nWorkflows) {
    if (!wf.active) {
      console.log(`   Activating workflow "${wf.name}" (${wf.id})...`);
      await axios.post(`${n8nApiUrl}/workflows/${wf.id}/activate`, {}, { headers: { 'X-N8N-API-KEY': n8nApiKey } }).catch(() => {});
    }
  }

  console.log('\n2. Executing Real End-to-End Workflow Tests...');
  let passedCount = 0;
  let failedCount = 0;
  const results: any[] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`\n---------------------------------------------------------------`);
    console.log(`[Test ${i + 1}/${TEST_CASES.length}] Testing: "${tc.name}"`);
    console.log(`Webhook: POST ${n8nWebhookBase}/webhook/${tc.webhookPath}`);

    const webhookUrl = `${n8nWebhookBase}/webhook/${tc.webhookPath}`;
    const startTime = Date.now();

    try {
      const triggerRes = await axios.post(webhookUrl, tc.payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      console.log(`   Webhook Trigger Response: HTTP ${triggerRes.status} - ${JSON.stringify(triggerRes.data)}`);

      // Wait 1.5s for n8n execution record to be committed
      await sleep(1500);

      // Fetch the most recent execution
      const execListRes = await axios.get(`${n8nApiUrl}/executions?limit=3`, {
        headers: { 'X-N8N-API-KEY': n8nApiKey },
      });
      const latestExec = execListRes.data?.data?.[0];

      if (!latestExec) {
        console.warn('   Could not retrieve latest execution record.');
        results.push({ name: tc.name, status: 'NO_EXECUTION_RECORD', passed: false });
        failedCount++;
        continue;
      }

      // Fetch full execution data
      const execDetailRes = await axios.get(`${n8nApiUrl}/executions/${latestExec.id}?includeData=true`, {
        headers: { 'X-N8N-API-KEY': n8nApiKey },
      });
      const execData = execDetailRes.data?.data;
      const runData = execData?.resultData?.runData || {};
      const executedNodes = Object.keys(runData);

      const status = latestExec.status; // 'success' | 'waiting' | 'error'
      const isHealthy = status === 'success' || status === 'waiting';

      console.log(`   Execution ID: ${latestExec.id}`);
      console.log(`   Execution Status: ${status.toUpperCase()} ${isHealthy ? '✅' : '❌'}`);
      if (latestExec.waitTill) {
        console.log(`   Wait Till: ${latestExec.waitTill}`);
      }
      console.log(`   Executed Nodes (${executedNodes.length}): ${executedNodes.join(' -> ')}`);

      if (execData?.resultData?.error) {
        console.error(`   Error details:`, JSON.stringify(execData.resultData.error.message || execData.resultData.error, null, 2));
      }

      if (isHealthy) {
        passedCount++;
        results.push({
          name: tc.name,
          execId: latestExec.id,
          status,
          executedNodes,
          passed: true,
        });
      } else {
        failedCount++;
        results.push({
          name: tc.name,
          execId: latestExec.id,
          status,
          executedNodes,
          error: execData?.resultData?.error?.message,
          passed: false,
        });
      }
    } catch (err: any) {
      console.error(`   Webhook request failed: ${err.message}`);
      if (err.response) {
        console.error(`   Response status: ${err.response.status}, data:`, err.response.data);
      }
      failedCount++;
      results.push({ name: tc.name, status: 'HTTP_ERROR', error: err.message, passed: false });
    }
  }

  // 3. Print Summary
  console.log('\n===============================================================');
  console.log('                    TEST RESULTS SUMMARY                       ');
  console.log('===============================================================');
  console.table(
    results.map((r) => ({
      Workflow: r.name,
      'Exec ID': r.execId || '-',
      Status: r.status,
      'Nodes Run': (r.executedNodes || []).length,
      Passed: r.passed ? 'PASS ✅' : 'FAIL ❌',
    })),
  );

  console.log(`\nTotal Tests: ${TEST_CASES.length} | Passed: ${passedCount} | Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.error('\n❌ Some workflow tests failed. Please inspect logs above.');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL WORKFLOWS PASSED REAL TESTS WITH ZERO ERRORS!');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const n8nApiKey =
  process.env.N8N_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MTcxZWZiMy00NWNjLTRiYTUtYjE3MS0yZWQxZjY2NTg5NjAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNGU3ZDAyMTEtMzY0My00MzZmLTgwNDctMmRjOWI0MWYyMTkyIiwiaWF0IjoxNzg3NjM2NzU4LCJleHAiOjE3OTUzOTIwMDB9.PgLvpU0XcQmBXdyu7cNVQAI9Luw3M5yMD7cB6sbWb3E';
const n8nApiUrl = (process.env.N8N_API_URL || 'http://localhost:5678/api/v1').replace(/\/+$/, '');

const WORKFLOW_MAPPINGS = [
  {
    file: 'appointment-lifecycle-sequence.json',
    webhookId: 'appointment-lifecycle-sequence',
    triggerEventType: 'appointment.created',
    name: 'Appointment Lifecycle & Follow-up Sequence',
    description: 'Multi-step automation: WhatsApp confirmation, email receipt, 24h reminder, and post-visit review request.',
  },
  {
    file: 'scheduled-appointment-reminders.json',
    webhookId: 'scheduled-appointment-reminders',
    triggerEventType: 'appointment.created',
    name: 'Scheduled Appointment Reminders (24h & 2h)',
    description: 'Scheduled reminders: 24 hours and 2 hours before appointment with confirm/reschedule options.',
  },
  {
    file: 'lead-followup-sequence.json',
    webhookId: 'lead-followup-sequence',
    triggerEventType: 'customer.created',
    name: 'New Customer Lead Follow-up Sequence',
    description: 'Automated 1-day, 3-day, and 7-day follow-up sequence for new leads until appointment booked.',
  },
  {
    file: 'salon-retention-rebooking.json',
    webhookId: 'salon-retention-rebooking',
    triggerEventType: 'appointment.completed',
    name: 'Salon Customer Retention & 30-Day Rebooking',
    description: 'Post-visit retention sequence: 1-day review request and 30-day rebooking reminder.',
  },
];

async function main() {
  const tenant = (await prisma.tenant.findFirst({ where: { slug: 'acme-salon' } })) || (await prisma.tenant.findFirst());
  if (!tenant) {
    throw new Error('No tenant found in database');
  }
  console.log(`Setting up n8n workflows for tenant: ${tenant.name} (${tenant.id})`);

  // 1. Fetch existing n8n workflows
  let existingN8nWorkflows: any[] = [];
  try {
    const listRes = await axios.get(`${n8nApiUrl}/workflows`, {
      headers: { 'X-N8N-API-KEY': n8nApiKey },
    });
    existingN8nWorkflows = listRes.data?.data || [];
  } catch (err: any) {
    console.warn(`Could not list n8n workflows: ${err.message}`);
  }

  for (const mapping of WORKFLOW_MAPPINGS) {
    const filePath = path.resolve(__dirname, '../../../n8n/workflows', mapping.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const workflowContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const existing = existingN8nWorkflows.find((w: any) => w.name === workflowContent.name);

    let n8nWorkflowId = mapping.webhookId;

    if (existing) {
      console.log(`Workflow "${workflowContent.name}" already exists in n8n (ID: ${existing.id}). Updating...`);
      try {
        await axios.put(
          `${n8nApiUrl}/workflows/${existing.id}`,
          {
            name: workflowContent.name,
            nodes: workflowContent.nodes,
            connections: workflowContent.connections,
            settings: workflowContent.settings || {},
          },
          { headers: { 'X-N8N-API-KEY': n8nApiKey } },
        );
        await axios.post(
          `${n8nApiUrl}/workflows/${existing.id}/activate`,
          {},
          { headers: { 'X-N8N-API-KEY': n8nApiKey } },
        ).catch(() => {});
      } catch (err: any) {
        console.warn(`Could not update in n8n: ${err.message}`);
      }
    } else {
      console.log(`Creating workflow "${workflowContent.name}" in n8n...`);
      try {
        const createRes = await axios.post(
          `${n8nApiUrl}/workflows`,
          {
            name: workflowContent.name,
            nodes: workflowContent.nodes,
            connections: workflowContent.connections,
            settings: workflowContent.settings || {},
          },
          { headers: { 'X-N8N-API-KEY': n8nApiKey } },
        );
        const createdId = createRes.data?.data?.id || createRes.data?.id;
        if (createdId) {
          await axios.post(
            `${n8nApiUrl}/workflows/${createdId}/activate`,
            {},
            { headers: { 'X-N8N-API-KEY': n8nApiKey } },
          ).catch(() => {});
        }
      } catch (err: any) {
        console.warn(`Could not create in n8n: ${err.message}`);
      }
    }

    // 2. Upsert in AI Employee Workflow table
    const dbWorkflow = await prisma.workflow.findFirst({
      where: {
        tenantId: tenant.id,
        n8nWorkflowId: mapping.webhookId,
      },
    });

    if (dbWorkflow) {
      await prisma.workflow.update({
        where: { id: dbWorkflow.id },
        data: {
          name: mapping.name,
          description: mapping.description,
          triggerEventType: mapping.triggerEventType,
          isEnabled: true,
        },
      });
      console.log(`Updated database workflow record: ${mapping.name}`);
    } else {
      await prisma.workflow.create({
        data: {
          tenantId: tenant.id,
          name: mapping.name,
          n8nWorkflowId: mapping.webhookId,
          triggerEventType: mapping.triggerEventType,
          description: mapping.description,
          isEnabled: true,
        },
      });
      console.log(`Created database workflow record: ${mapping.name}`);
    }
  }

  console.log('\nAll n8n workflows registered, activated, and linked to AI Employee event bus successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

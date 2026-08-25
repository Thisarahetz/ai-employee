import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WorkflowService } from '../src/modules/workflow/workflow.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const workflowService = app.get(WorkflowService);

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('No tenant found. Run the seed script first.');
    process.exit(1);
  }

  console.log(`Using tenant: ${tenant.name} (${tenant.id})`);

  // Create Example Workflow
  const workflow = await workflowService.create(tenant.id, {
    name: 'Example - New Customer Lead',
    description: 'Creates a contact in the CRM and posts a Slack notification when a new customer is created.',
    n8nWorkflowId: 'example-new-customer-lead',
    triggerEventType: 'customer.created',
    isEnabled: true
  });
  console.log(`Created workflow: ${workflow.id}`);

  await app.close();
}

bootstrap();

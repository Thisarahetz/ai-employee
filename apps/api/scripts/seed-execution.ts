import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { randomUUID } from 'crypto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  const workflow = await prisma.workflow.findFirst({
    where: { triggerEventType: 'customer.created' }
  });

  if (!workflow) {
    console.error('No workflow found.');
    process.exit(1);
  }

  // Create a fake execution
  await prisma.workflowExecution.create({
    data: {
      tenantId: workflow.tenantId,
      workflowId: workflow.id,
      status: 'SUCCESS',
      n8nExecutionId: randomUUID(),
      input: {
        tenantId: workflow.tenantId,
        eventType: 'customer.created',
        customerId: 'cus_test_123',
        data: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com'
        }
      },
      finishedAt: new Date()
    }
  });

  console.log(`Created successful execution for workflow ${workflow.name}`);
  await app.close();
}

bootstrap();

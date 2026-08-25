import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EventService } from '../src/events/event.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const eventService = app.get(EventService);

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('No tenant found. Run the seed script first.');
    process.exit(1);
  }

  console.log(`Using tenant: ${tenant.name} (${tenant.id})`);

  // Fire an event to trigger the workflow
  await eventService.emit(
    tenant.id, 
    'customer.created', 
    {
      customerId: 'cus_test_123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com'
    }, 
    'api/script'
  );

  console.log(`Fired customer.created event!`);
  
  // Wait a second for async listeners
  await new Promise(resolve => setTimeout(resolve, 1000));

  await app.close();
}

bootstrap();

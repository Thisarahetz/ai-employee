import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConversationService } from '../src/modules/conversation/conversation.service';
import { MessageContentType } from '@prisma/client';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const conversationService = app.get(ConversationService);

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('No tenant found.');
    process.exit(1);
  }

  // Ensure a channel exists for the tenant
  let channel = await prisma.channel.findFirst({
    where: { tenantId: tenant.id }
  });

  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        tenantId: tenant.id,
        name: 'Website Chat',
        type: 'WEBSITE_CHAT',
        config: {},
      }
    });
  }

  console.log(`Simulating message on channel ${channel.id}`);

  // Ingest inbound message
  await conversationService.ingestInboundMessage({
    tenantId: tenant.id,
    channelId: channel.id,
    customerExternalId: 'session_999',
    customerName: 'Alice (Website Visitor)',
    content: 'Hi! Do you have any availability for a haircut tomorrow?',
    contentType: MessageContentType.TEXT,
  });

  console.log('Simulated message sent successfully!');
  
  // Wait a few seconds for async AI processing if any
  await new Promise(resolve => setTimeout(resolve, 3000));
  await app.close();
}

bootstrap();

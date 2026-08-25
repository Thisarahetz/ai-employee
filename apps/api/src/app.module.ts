import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { EventModule } from './events/event.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { BusinessModule } from './modules/business/business.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { MessageModule } from './modules/message/message.module';
import { HumanHandoffModule } from './modules/human-handoff/human-handoff.module';
import { NotificationModule } from './modules/notification/notification.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiUsageLogsModule } from './modules/ai-usage-logs/ai-usage-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: +(process.env.REDIS_PORT ?? 6379),
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    EventModule,
    AuthModule,
    TenantModule,
    UserModule,
    BusinessModule,
    ConversationModule,
    MessageModule,
    HumanHandoffModule,
    NotificationModule,
    WebhookModule,
    AuditLogModule,
    AiAgentModule,
    KnowledgeBaseModule,
    IntegrationModule,
    WorkflowModule,
    AdminModule,
    AiUsageLogsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}

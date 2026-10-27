import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

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
import { WebsiteChatModule } from './modules/website-chat/website-chat.module';
import { MessageModule } from './modules/message/message.module';
import { HumanHandoffModule } from './modules/human-handoff/human-handoff.module';
import { NotificationModule } from './modules/notification/notification.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { ChannelModule } from './modules/channel/channel.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiUsageLogsModule } from './modules/ai-usage-logs/ai-usage-logs.module';
import { AiEmployeeModule } from './modules/ai-employee/ai-employee.module';
import { AiWorkforceModule } from './modules/ai-workforce/ai-workforce.module';
import { ReplyEngineModule } from './modules/reply-engine/reply-engine.module';
import { NluModule } from './modules/nlu/nlu.module';
import { BusinessSetupModule } from './modules/business-setup/business-setup.module';
import { VoiceModule } from './modules/voice/voice.module';
import { HealthModule } from './modules/health/health.module';
import { DynamicSagaModule } from './modules/saga/dynamic-saga.module';
import { PolicySynthesisModule } from './modules/policy-synthesis/policy-synthesis.module';

/** REDIS_URL (supports password and rediss:// TLS) wins over REDIS_HOST/REDIS_PORT. */
function redisConnection() {
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) || 0 : 0,
      tls: u.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }
  return { host: process.env.REDIS_HOST || 'localhost', port: +(process.env.REDIS_PORT ?? 6379), maxRetriesPerRequest: null };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    BullModule.forRoot({
      connection: redisConnection(),
      // Separate key namespaces let tests / several environments share one Redis.
      prefix: process.env.BULL_PREFIX || 'bull',
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    EventModule,
    HealthModule,
    AuthModule,
    TenantModule,
    UserModule,
    BusinessModule,
    ConversationModule,
    WebsiteChatModule,
    MessageModule,
    HumanHandoffModule,
    NotificationModule,
    WebhookModule,
    AuditLogModule,
    AiAgentModule,
    KnowledgeBaseModule,
    IntegrationModule,
    ChannelModule,
    WorkflowModule,
    AdminModule,
    AiUsageLogsModule,
    AiEmployeeModule,
    AiWorkforceModule,
    ReplyEngineModule,
    NluModule,
    VoiceModule,
    BusinessSetupModule,
    DynamicSagaModule,
    PolicySynthesisModule,
  ],
  providers: [
    // Per-IP rate limit on every route (tighter per-route limits via @Throttle).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}

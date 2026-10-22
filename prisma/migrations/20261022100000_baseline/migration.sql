-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('SALON', 'HOTEL', 'CLINIC', 'ECOMMERCE', 'CRM', 'VEHICLE_SERVICE', 'ERP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'AI_HANDLING', 'HUMAN_HANDLING', 'CLOSED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('ROUTER', 'SUPPORT', 'KNOWLEDGE', 'ACTION', 'HUMAN');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('CUSTOMER', 'AI', 'HUMAN_AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'AUDIO', 'LOCATION', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "DocumentSourceType" AS ENUM ('PDF', 'DOCX', 'TEXT', 'FAQ', 'URL', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('STANDARD_API', 'REST_API', 'WEBHOOK', 'N8N');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('API_KEY', 'OAUTH2', 'BASIC_AUTH', 'BEARER_TOKEN');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'WEBSITE_CHAT', 'EMAIL', 'FACEBOOK_MESSENGER', 'INSTAGRAM', 'TELEGRAM', 'SMS', 'VOICE');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AiProviderName" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "HandoffReason" AS ENUM ('CUSTOMER_REQUEST', 'LOW_CONFIDENCE', 'UNSUPPORTED_REQUEST', 'SENSITIVE_REQUEST', 'REPEATED_FAILURE');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('PENDING', 'ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReversibilityType" AS ENUM ('QUERY', 'COMPENSATABLE', 'TERMINAL_IRREVERSIBLE');

-- CreateEnum
CREATE TYPE "SagaStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'COMPENSATED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvariantStatus" AS ENUM ('CANDIDATE', 'SHADOW_VERIFIED', 'ACTIVE', 'REJECTED', 'DEPRECATED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BusinessType" NOT NULL DEFAULT 'CUSTOM',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "integrationId" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "refreshTokenHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "jobTitle" TEXT,
    "businessRole" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'STANDARD',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allLocations" BOOLEAN NOT NULL DEFAULT true,
    "locationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "customerId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "currentAgent" "AgentType",
    "assignedUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "agentType" "AgentType",
    "content" TEXT NOT NULL,
    "contentType" "MessageContentType" NOT NULL DEFAULT 'TEXT',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_summaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "coveredUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" "DocumentSourceType" NOT NULL,
    "fileUrl" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "integrationId" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "chunkIndex" INTEGER NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "name" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "baseUrl" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "knowledgeBaseId" TEXT,
    "lastKnowledgeSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDiscoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "type" "ChannelType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "AgentType" NOT NULL,
    "name" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_configurations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aiAgentId" TEXT NOT NULL,
    "provider" "AiProviderName" NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "extraParams" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "agentType" "AgentType" NOT NULL,
    "provider" "AiProviderName" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostUsd" DECIMAL(10,6) NOT NULL,
    "executionTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_employees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "businessFunction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "avatar" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "actionLevel" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "scope" TEXT NOT NULL DEFAULT 'ALL_BRANCHES',
    "branchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responsibilities" JSONB NOT NULL DEFAULT '[]',
    "assignedTasks" JSONB NOT NULL DEFAULT '[]',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "connectedTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "toolAccessConfigured" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_employee_approvals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionPayload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,
    "taskId" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionResult" JSONB,

    CONSTRAINT "ai_employee_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_employee_activities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_employee_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "parentTaskId" TEXT,
    "delegatedFromTaskId" TEXT,
    "reviewOfTaskId" TEXT,
    "threadId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'TASK',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "goal" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "contextTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "result" TEXT,
    "error" TEXT,
    "createdByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_task_steps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "toolName" TEXT,
    "input" JSONB,
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_task_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_command_threads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "focus" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_command_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_command_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "userId" TEXT,
    "employeeId" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_command_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "name" TEXT NOT NULL,
    "n8nWorkflowId" TEXT NOT NULL,
    "triggerEventType" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "eventId" TEXT,
    "status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "n8nExecutionId" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_handoffs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reason" "HandoffReason" NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'PENDING',
    "assignedUserId" TEXT,
    "notes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "human_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "sourceService" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dynamic_sagas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" "SagaStatus" NOT NULL DEFAULT 'ACTIVE',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dynamic_sagas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saga_steps" (
    "id" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "reversibility" "ReversibilityType" NOT NULL DEFAULT 'COMPENSATABLE',
    "inputPayload" JSONB NOT NULL DEFAULT '{}',
    "outputPayload" JSONB,
    "compensatingAction" TEXT,
    "isCompensated" BOOLEAN NOT NULL DEFAULT false,
    "compensatedAt" TIMESTAMP(3),
    "error" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saga_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synthesized_invariants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceHandoffId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "conditionRule" JSONB NOT NULL,
    "actionOverride" JSONB,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "regressionPassRate" DOUBLE PRECISION,
    "status" "InvariantStatus" NOT NULL DEFAULT 'CANDIDATE',
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synthesized_invariants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "businesses_tenantId_idx" ON "businesses"("tenantId");

-- CreateIndex
CREATE INDEX "businesses_integrationId_idx" ON "businesses"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_integrationId_externalId_key" ON "businesses"("integrationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "tenant_users_tenantId_idx" ON "tenant_users"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_users_userId_idx" ON "tenant_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_tenantId_userId_key" ON "tenant_users"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "customers_tenantId_idx" ON "customers"("tenantId");

-- CreateIndex
CREATE INDEX "customers_tenantId_externalId_idx" ON "customers"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_idx" ON "conversations"("tenantId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_status_idx" ON "conversations"("tenantId", "status");

-- CreateIndex
CREATE INDEX "conversations_tenantId_customerId_idx" ON "conversations"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "messages_tenantId_idx" ON "messages"("tenantId");

-- CreateIndex
CREATE INDEX "messages_tenantId_conversationId_createdAt_idx" ON "messages"("tenantId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_summaries_tenantId_idx" ON "conversation_summaries"("tenantId");

-- CreateIndex
CREATE INDEX "conversation_summaries_tenantId_conversationId_coveredUntil_idx" ON "conversation_summaries"("tenantId", "conversationId", "coveredUntil");

-- CreateIndex
CREATE INDEX "knowledge_bases_tenantId_idx" ON "knowledge_bases"("tenantId");

-- CreateIndex
CREATE INDEX "documents_tenantId_idx" ON "documents"("tenantId");

-- CreateIndex
CREATE INDEX "documents_tenantId_knowledgeBaseId_idx" ON "documents"("tenantId", "knowledgeBaseId");

-- CreateIndex
CREATE INDEX "documents_integrationId_idx" ON "documents"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_integrationId_externalId_key" ON "documents"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "document_chunks_tenantId_idx" ON "document_chunks"("tenantId");

-- CreateIndex
CREATE INDEX "document_chunks_tenantId_knowledgeBaseId_idx" ON "document_chunks"("tenantId", "knowledgeBaseId");

-- CreateIndex
CREATE INDEX "integrations_tenantId_idx" ON "integrations"("tenantId");

-- CreateIndex
CREATE INDEX "integrations_knowledgeBaseId_idx" ON "integrations"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "integration_credentials_tenantId_idx" ON "integration_credentials"("tenantId");

-- CreateIndex
CREATE INDEX "integration_actions_tenantId_idx" ON "integration_actions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_actions_integrationId_name_key" ON "integration_actions"("integrationId", "name");

-- CreateIndex
CREATE INDEX "channels_tenantId_idx" ON "channels"("tenantId");

-- CreateIndex
CREATE INDEX "channel_credentials_tenantId_idx" ON "channel_credentials"("tenantId");

-- CreateIndex
CREATE INDEX "ai_agents_tenantId_idx" ON "ai_agents"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agents_tenantId_type_key" ON "ai_agents"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ai_configurations_aiAgentId_key" ON "ai_configurations"("aiAgentId");

-- CreateIndex
CREATE INDEX "ai_configurations_tenantId_idx" ON "ai_configurations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_logs_messageId_key" ON "ai_usage_logs"("messageId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_tenantId_idx" ON "ai_usage_logs"("tenantId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_tenantId_agentType_createdAt_idx" ON "ai_usage_logs"("tenantId", "agentType", "createdAt");

-- CreateIndex
CREATE INDEX "ai_employees_tenantId_idx" ON "ai_employees"("tenantId");

-- CreateIndex
CREATE INDEX "ai_employees_tenantId_status_idx" ON "ai_employees"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ai_employee_approvals_tenantId_idx" ON "ai_employee_approvals"("tenantId");

-- CreateIndex
CREATE INDEX "ai_employee_approvals_tenantId_status_idx" ON "ai_employee_approvals"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ai_employee_approvals_taskId_idx" ON "ai_employee_approvals"("taskId");

-- CreateIndex
CREATE INDEX "ai_employee_activities_tenantId_idx" ON "ai_employee_activities"("tenantId");

-- CreateIndex
CREATE INDEX "ai_employee_activities_tenantId_employeeId_createdAt_idx" ON "ai_employee_activities"("tenantId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_tasks_tenantId_idx" ON "ai_tasks"("tenantId");

-- CreateIndex
CREATE INDEX "ai_tasks_tenantId_status_idx" ON "ai_tasks"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ai_tasks_tenantId_employeeId_createdAt_idx" ON "ai_tasks"("tenantId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_tasks_parentTaskId_idx" ON "ai_tasks"("parentTaskId");

-- CreateIndex
CREATE INDEX "ai_task_steps_tenantId_idx" ON "ai_task_steps"("tenantId");

-- CreateIndex
CREATE INDEX "ai_task_steps_taskId_seq_idx" ON "ai_task_steps"("taskId", "seq");

-- CreateIndex
CREATE INDEX "owner_command_threads_tenantId_userId_updatedAt_idx" ON "owner_command_threads"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "owner_command_messages_tenantId_idx" ON "owner_command_messages"("tenantId");

-- CreateIndex
CREATE INDEX "owner_command_messages_threadId_createdAt_idx" ON "owner_command_messages"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "workflows_tenantId_idx" ON "workflows"("tenantId");

-- CreateIndex
CREATE INDEX "workflow_executions_tenantId_idx" ON "workflow_executions"("tenantId");

-- CreateIndex
CREATE INDEX "workflow_executions_tenantId_workflowId_startedAt_idx" ON "workflow_executions"("tenantId", "workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "human_handoffs_tenantId_idx" ON "human_handoffs"("tenantId");

-- CreateIndex
CREATE INDEX "human_handoffs_tenantId_status_idx" ON "human_handoffs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_userId_isRead_idx" ON "notifications"("tenantId", "userId", "isRead");

-- CreateIndex
CREATE INDEX "events_tenantId_idx" ON "events"("tenantId");

-- CreateIndex
CREATE INDEX "events_tenantId_type_createdAt_idx" ON "events"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entityType_entityId_idx" ON "audit_logs"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "platform_audit_logs_targetType_targetId_idx" ON "platform_audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "dynamic_sagas_tenantId_idx" ON "dynamic_sagas"("tenantId");

-- CreateIndex
CREATE INDEX "dynamic_sagas_tenantId_conversationId_idx" ON "dynamic_sagas"("tenantId", "conversationId");

-- CreateIndex
CREATE INDEX "saga_steps_sagaId_idx" ON "saga_steps"("sagaId");

-- CreateIndex
CREATE UNIQUE INDEX "synthesized_invariants_sourceHandoffId_key" ON "synthesized_invariants"("sourceHandoffId");

-- CreateIndex
CREATE INDEX "synthesized_invariants_tenantId_idx" ON "synthesized_invariants"("tenantId");

-- CreateIndex
CREATE INDEX "synthesized_invariants_tenantId_status_idx" ON "synthesized_invariants"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_actions" ADD CONSTRAINT "integration_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_actions" ADD CONSTRAINT "integration_actions_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_credentials" ADD CONSTRAINT "channel_credentials_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_configurations" ADD CONSTRAINT "ai_configurations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_configurations" ADD CONSTRAINT "ai_configurations_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_employees" ADD CONSTRAINT "ai_employees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_employee_approvals" ADD CONSTRAINT "ai_employee_approvals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_employee_approvals" ADD CONSTRAINT "ai_employee_approvals_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "ai_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_employee_approvals" ADD CONSTRAINT "ai_employee_approvals_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ai_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_employee_activities" ADD CONSTRAINT "ai_employee_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_employee_activities" ADD CONSTRAINT "ai_employee_activities_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "ai_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "ai_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "ai_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "owner_command_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_steps" ADD CONSTRAINT "ai_task_steps_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ai_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_command_threads" ADD CONSTRAINT "owner_command_threads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_command_messages" ADD CONSTRAINT "owner_command_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "owner_command_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dynamic_sagas" ADD CONSTRAINT "dynamic_sagas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dynamic_sagas" ADD CONSTRAINT "dynamic_sagas_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saga_steps" ADD CONSTRAINT "saga_steps_sagaId_fkey" FOREIGN KEY ("sagaId") REFERENCES "dynamic_sagas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synthesized_invariants" ADD CONSTRAINT "synthesized_invariants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synthesized_invariants" ADD CONSTRAINT "synthesized_invariants_sourceHandoffId_fkey" FOREIGN KEY ("sourceHandoffId") REFERENCES "human_handoffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


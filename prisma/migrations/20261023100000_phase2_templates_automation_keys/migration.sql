-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "industryTemplateKey" TEXT,
ADD COLUMN     "profile" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "webhookSecretEncrypted" TEXT;

-- AlterTable
ALTER TABLE "ai_tasks" ADD COLUMN     "automationRuleId" TEXT,
ADD COLUMN     "triggerContext" JSONB;

-- CreateTable
CREATE TABLE "industry_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "icon" TEXT NOT NULL DEFAULT 'Briefcase',
    "description" TEXT NOT NULL DEFAULT '',
    "businessType" "BusinessType" NOT NULL DEFAULT 'CUSTOM',
    "definition" JSONB NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "basedOnKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_automation_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerEvent" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actionType" TEXT NOT NULL DEFAULT 'CREATE_TASK',
    "employeeId" TEXT,
    "taskTitle" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dedupeKey" TEXT,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxRunsPerHour" INTEGER NOT NULL DEFAULT 20,
    "allowAiTriggered" BOOLEAN NOT NULL DEFAULT false,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "templateKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_automation_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "dedupeValue" TEXT,
    "status" TEXT NOT NULL,
    "taskId" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_ai_provider_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "AiProviderName" NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ai_provider_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "industry_templates_isPublished_idx" ON "industry_templates"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "industry_templates_tenantId_key_key" ON "industry_templates"("tenantId", "key");

-- CreateIndex
CREATE INDEX "ai_automation_rules_tenantId_triggerEvent_enabled_idx" ON "ai_automation_rules"("tenantId", "triggerEvent", "enabled");

-- CreateIndex
CREATE INDEX "ai_automation_runs_ruleId_createdAt_idx" ON "ai_automation_runs"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_automation_runs_ruleId_dedupeValue_createdAt_idx" ON "ai_automation_runs"("ruleId", "dedupeValue", "createdAt");

-- CreateIndex
CREATE INDEX "ai_automation_runs_tenantId_createdAt_idx" ON "ai_automation_runs"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_ai_provider_keys_tenantId_provider_key" ON "tenant_ai_provider_keys"("tenantId", "provider");

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "ai_automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_templates" ADD CONSTRAINT "industry_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automation_rules" ADD CONSTRAINT "ai_automation_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automation_rules" ADD CONSTRAINT "ai_automation_rules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "ai_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ai_automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ai_provider_keys" ADD CONSTRAINT "tenant_ai_provider_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Platform templates (tenantId IS NULL) need unique keys too; Postgres treats NULLs as distinct.
CREATE UNIQUE INDEX "industry_templates_platform_key_key" ON "industry_templates"("key") WHERE "tenantId" IS NULL;

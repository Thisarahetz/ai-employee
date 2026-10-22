-- AlterTable
ALTER TABLE "ai_usage_logs" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "ai_tasks" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "inputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "nextRunAt" TIMESTAMP(3),
ADD COLUMN     "outputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "ai_task_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "goal" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "overlapPolicy" TEXT NOT NULL DEFAULT 'SKIP',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastTaskId" TEXT,
    "lastStatus" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "maxConsecutiveFailures" INTEGER NOT NULL DEFAULT 3,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_task_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_ai_settings" (
    "tenantId" TEXT NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyBudgetUsd" DECIMAL(10,2),
    "dailyBudgetUsd" DECIMAL(10,2),
    "maxTaskCostUsd" DECIMAL(10,4),
    "maxTaskSteps" INTEGER,
    "maxConcurrentTasks" INTEGER,
    "maxTasksPerDay" INTEGER,
    "maxSchedules" INTEGER,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ai_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "ai_task_schedules_tenantId_idx" ON "ai_task_schedules"("tenantId");

-- CreateIndex
CREATE INDEX "ai_task_schedules_enabled_nextRunAt_idx" ON "ai_task_schedules"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "ai_task_schedules_employeeId_idx" ON "ai_task_schedules"("employeeId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_tenantId_createdAt_idx" ON "ai_usage_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_taskId_idx" ON "ai_usage_logs"("taskId");

-- CreateIndex
CREATE INDEX "ai_tasks_scheduleId_status_idx" ON "ai_tasks"("scheduleId", "status");

-- CreateIndex
CREATE INDEX "ai_tasks_status_heartbeatAt_idx" ON "ai_tasks"("status", "heartbeatAt");

-- AddForeignKey
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ai_task_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_schedules" ADD CONSTRAINT "ai_task_schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_schedules" ADD CONSTRAINT "ai_task_schedules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "ai_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ai_settings" ADD CONSTRAINT "tenant_ai_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


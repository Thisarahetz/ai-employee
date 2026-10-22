-- AlterTable
ALTER TABLE "ai_employees" ADD COLUMN     "toolAccessConfigured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ai_employee_approvals" ADD COLUMN     "executedAt" TIMESTAMP(3),
ADD COLUMN     "executionResult" JSONB,
ADD COLUMN     "taskId" TEXT;

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
CREATE INDEX "ai_employee_approvals_taskId_idx" ON "ai_employee_approvals"("taskId");

-- AddForeignKey
ALTER TABLE "ai_employee_approvals" ADD CONSTRAINT "ai_employee_approvals_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ai_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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


-- Reply engine: per-business reply mode (AI / Hybrid / No-AI), saved answers
-- matched without AI, and per-plan allowed reply modes. Additive only.

-- CreateEnum
CREATE TYPE "ReplyMode" AS ENUM ('AI', 'HYBRID', 'NO_AI');

-- CreateEnum
CREATE TYPE "SavedAnswerStatus" AS ENUM ('ACTIVE', 'SUGGESTED', 'DISABLED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "replyMode" "ReplyMode" NOT NULL DEFAULT 'HYBRID';

-- CreateTable
CREATE TABLE "saved_answers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "SavedAnswerStatus" NOT NULL DEFAULT 'ACTIVE',
    "questions" TEXT[],
    "answerEn" TEXT NOT NULL DEFAULT '',
    "answerSi" TEXT NOT NULL DEFAULT '',
    "answerSiLatn" TEXT NOT NULL DEFAULT '',
    "askedCount" INTEGER NOT NULL DEFAULT 0,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "sourceConversationId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_settings" (
    "planId" TEXT NOT NULL,
    "allowedReplyModes" "ReplyMode"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_settings_pkey" PRIMARY KEY ("planId")
);

-- CreateIndex
CREATE INDEX "saved_answers_tenantId_status_idx" ON "saved_answers"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


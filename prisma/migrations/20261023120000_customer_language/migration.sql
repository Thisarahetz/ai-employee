-- Customer language support (English, Sinhala, Singlish).
ALTER TABLE "tenants" ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "tenants" ADD COLUMN "matchCustomerLanguage" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "conversations" ADD COLUMN "language" TEXT;
CREATE INDEX "conversations_tenantId_language_idx" ON "conversations"("tenantId", "language");

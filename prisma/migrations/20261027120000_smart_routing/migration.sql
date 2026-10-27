-- Per-business switch for Rasa-first message routing. Additive; on by default
-- (it still only takes effect when the platform has RASA_ENABLED=true).
ALTER TABLE "tenants" ADD COLUMN "smartRouting" BOOLEAN NOT NULL DEFAULT true;

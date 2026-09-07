ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "monthly_budget" integer NOT NULL DEFAULT 0;

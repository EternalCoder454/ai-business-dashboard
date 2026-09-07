ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "business_notes" text NOT NULL DEFAULT '';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "market_notes" text NOT NULL DEFAULT '';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "direction_notes" text NOT NULL DEFAULT '';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "facts_notes" text NOT NULL DEFAULT '';

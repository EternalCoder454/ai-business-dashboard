ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "sections" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "density" text NOT NULL DEFAULT 'comfortable';

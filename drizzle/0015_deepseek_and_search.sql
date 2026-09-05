ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "deepseek_key" text NOT NULL DEFAULT '';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "perplexity_key" text NOT NULL DEFAULT '';

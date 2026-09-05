ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "web_search" text NOT NULL DEFAULT 'off';

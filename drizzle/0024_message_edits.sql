ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "edited_at" bigint;
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "original_body" text;
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "deleted_at" bigint;
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "deleted_by" text;

CREATE INDEX IF NOT EXISTS "dm_live_idx" ON "direct_messages" ("thread_key", "deleted_at");

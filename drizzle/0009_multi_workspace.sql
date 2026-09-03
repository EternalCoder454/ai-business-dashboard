ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "active_workspace_id" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'access'
      AND c.contype = 'p'
      AND array_length(c.conkey, 1) = 2
  ) THEN
    ALTER TABLE "access" DROP CONSTRAINT IF EXISTS "access_pkey";
    ALTER TABLE "access" ADD CONSTRAINT "access_pkey" PRIMARY KEY ("email", "workspace_id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "access_email_idx" ON "access" ("email","revoked_at");

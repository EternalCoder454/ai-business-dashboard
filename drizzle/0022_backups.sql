CREATE TABLE IF NOT EXISTS "backups" (
  "id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "label" text NOT NULL DEFAULT '',
  "kind" text NOT NULL DEFAULT 'manual',
  "taken_by" text NOT NULL DEFAULT '',
  "bytes" integer NOT NULL DEFAULT 0,
  "counts" jsonb,
  "payload" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "backups_pk" PRIMARY KEY ("workspace_id", "id")
);

CREATE INDEX IF NOT EXISTS "backups_ws_idx" ON "backups" ("workspace_id", "created_at" DESC);

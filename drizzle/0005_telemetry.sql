CREATE TABLE IF NOT EXISTS "telemetry" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "operation" text NOT NULL,
  "source" text DEFAULT 'server' NOT NULL,
  "bucket" bigint NOT NULL,
  "calls" integer DEFAULT 0 NOT NULL,
  "errors" integer DEFAULT 0 NOT NULL,
  "total_ms" bigint DEFAULT 0 NOT NULL,
  "max_ms" integer DEFAULT 0 NOT NULL,
  "slow" integer DEFAULT 0 NOT NULL,
  "last_error_kind" text,
  "last_error_note" text DEFAULT '' NOT NULL,
  "last_error_at" bigint,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "telemetry_ws_idx" ON "telemetry" ("workspace_id","bucket");
CREATE INDEX IF NOT EXISTS "telemetry_bucket_idx" ON "telemetry" ("bucket");

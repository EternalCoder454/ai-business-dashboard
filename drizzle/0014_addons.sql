CREATE TABLE IF NOT EXISTS "addons" (
  "id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "recipe" jsonb NOT NULL,
  "trigger" text NOT NULL,
  "hosts" text NOT NULL DEFAULT '',
  "state" text NOT NULL DEFAULT 'pending',
  "created_by" text NOT NULL DEFAULT '',
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "last_run_at" timestamp with time zone,
  "runs" integer NOT NULL DEFAULT 0,
  "failures" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "addons_pkey" PRIMARY KEY ("workspace_id", "id")
);

CREATE INDEX IF NOT EXISTS "addons_trigger_idx"
  ON "addons" ("workspace_id", "state", "trigger");

CREATE TABLE IF NOT EXISTS "addon_runs" (
  "id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "addon_id" text NOT NULL,
  "ok" boolean NOT NULL DEFAULT false,
  "ran" boolean NOT NULL DEFAULT false,
  "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "addon_runs_pkey" PRIMARY KEY ("workspace_id", "id")
);

CREATE INDEX IF NOT EXISTS "addon_runs_recent_idx"
  ON "addon_runs" ("workspace_id", "addon_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"department_id" text NOT NULL,
	"prompt" text NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"weekday" integer DEFAULT 1 NOT NULL,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "briefings" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"schedule_id" text,
	"schedule_name" text DEFAULT '' NOT NULL,
	"department_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "schedules_ws_idx" ON "schedules" ("workspace_id","enabled");
CREATE INDEX IF NOT EXISTS "briefings_ws_idx" ON "briefings" ("workspace_id","created_at");

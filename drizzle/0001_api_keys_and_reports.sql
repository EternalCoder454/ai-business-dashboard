CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last4" text DEFAULT '' NOT NULL,
	"scopes" text DEFAULT 'tasks:read' NOT NULL,
	"created_by" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_name" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"source_id" text DEFAULT '' NOT NULL,
	"author_email" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "review_cursors" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"messages_through" bigint DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hash_idx" ON "api_keys" ("token_hash");
CREATE INDEX IF NOT EXISTS "api_keys_ws_idx" ON "api_keys" ("workspace_id","created_at");
CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" ("status","created_at");
CREATE INDEX IF NOT EXISTS "reports_ws_idx" ON "reports" ("workspace_id","created_at");

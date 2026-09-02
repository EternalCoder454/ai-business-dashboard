CREATE TABLE IF NOT EXISTS "idempotency" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"body_hash" text NOT NULL,
	"status" integer,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idempotency_age_idx" ON "idempotency" ("created_at");

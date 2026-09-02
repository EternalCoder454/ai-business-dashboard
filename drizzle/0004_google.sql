CREATE TABLE IF NOT EXISTS "google_connections" (
	"user_email" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"refresh_token" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"google_email" text DEFAULT '' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

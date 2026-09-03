CREATE TABLE IF NOT EXISTS "link_allowlist" (
  "workspace_id" text NOT NULL,
  "domain" text NOT NULL,
  "added_by" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "link_allowlist_pkey" PRIMARY KEY ("workspace_id", "domain")
);

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "accent" text NOT NULL DEFAULT '';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assigned_to" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_by" text;

CREATE TABLE IF NOT EXISTS "task_comments" (
  "id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "task_id" text NOT NULL,
  "author_email" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "task_comments_pk" PRIMARY KEY ("workspace_id", "id")
);

CREATE INDEX IF NOT EXISTS "task_comments_task_idx" ON "task_comments" ("workspace_id", "task_id", "created_at");

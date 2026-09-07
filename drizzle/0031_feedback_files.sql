CREATE TABLE IF NOT EXISTS "feedback_files" (
  "id" text PRIMARY KEY,
  "feedback_id" text NOT NULL,
  "name" text NOT NULL DEFAULT '',
  "media_type" text NOT NULL,
  "size" integer NOT NULL DEFAULT 0,
  "data" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "feedback_files_idx" ON "feedback_files" ("feedback_id");

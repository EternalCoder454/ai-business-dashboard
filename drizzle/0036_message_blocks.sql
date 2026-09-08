CREATE TABLE IF NOT EXISTS "message_blocks" (
  "workspace_id" text NOT NULL,
  "blocker_email" text NOT NULL,
  "blocked_email" text NOT NULL,
  "created_at" bigint NOT NULL,
  PRIMARY KEY ("workspace_id", "blocker_email", "blocked_email")
);

CREATE INDEX IF NOT EXISTS "message_blocks_blocked_idx"
  ON "message_blocks" ("workspace_id", "blocked_email");

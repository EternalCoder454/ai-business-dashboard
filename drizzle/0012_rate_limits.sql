CREATE TABLE IF NOT EXISTS "rate_limits" (
  "bucket" text NOT NULL,
  "window_start" bigint NOT NULL,
  "hits" integer NOT NULL DEFAULT 0,
  CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("bucket", "window_start")
);

CREATE INDEX IF NOT EXISTS "rate_limits_window_idx" ON "rate_limits" ("window_start");

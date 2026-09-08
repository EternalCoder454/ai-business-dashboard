CREATE TABLE IF NOT EXISTS "matrix_identities" (
  "email" text PRIMARY KEY,
  "matrix_user_id" text NOT NULL,
  "created_at" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS "matrix_rooms" (
  "workspace_id" text NOT NULL,
  "thread_key" text NOT NULL,
  "room_id" text NOT NULL,
  "created_at" bigint NOT NULL,
  PRIMARY KEY ("workspace_id", "thread_key")
);

CREATE TABLE IF NOT EXISTS "matrix_transactions" (
  "txn_id" text PRIMARY KEY,
  "received_at" bigint NOT NULL
);

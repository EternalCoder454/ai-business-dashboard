-- Files move off Vercel Blob and onto the disk the app runs on.
--
-- The column held a blob store URL and now holds a key like
-- "workspaces/abc/0f3e....webp", so it is renamed with the value. A column
-- called blob_url holding a relative path is a column that lies to whoever
-- reads it next.
--
-- Idempotent both ways, so this can be applied to a database that has already
-- had it and to one built fresh from 0000_init.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'files' AND column_name = 'blob_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'files' AND column_name = 'storage_key'
  ) THEN
    ALTER TABLE "files" RENAME COLUMN "blob_url" TO "storage_key";
  END IF;
END $$;

-- Anything still pointing at the old store points at somewhere this deployment
-- cannot reach. Emptied rather than left, so the row reads as a file with no
-- bytes, which is what it is, instead of failing on every read forever.
UPDATE "files" SET "storage_key" = '' WHERE "storage_key" LIKE 'http%';

-- How much room a business gets.
--
-- A column rather than a constant because it is meant to move: a business
-- buying more room should be an update here, not a deploy. One gigabyte,
-- decimal, which is the number the product says out loud.
ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "storage_limit_bytes" bigint NOT NULL DEFAULT 1000000000;

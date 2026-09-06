ALTER TABLE "departments"
  ALTER COLUMN "web_search" TYPE text
  USING (CASE WHEN "web_search" IS FALSE THEN 'off' ELSE NULL END);

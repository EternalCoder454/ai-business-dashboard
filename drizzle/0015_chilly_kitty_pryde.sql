ALTER TABLE "settings" ALTER COLUMN "company_name" SET DEFAULT 'Your Company';--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD COLUMN "blocks" jsonb;
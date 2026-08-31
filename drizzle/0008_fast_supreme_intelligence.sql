ALTER TABLE "accounts" ADD COLUMN "expertise" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "preferences" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "current_focus" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "products" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "stage" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "competitors" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "constraints" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "goals" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "company_mark" text DEFAULT 'HQ' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "company_logo_url" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "sidebar_side" text DEFAULT 'left' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "search_shortcut" text DEFAULT 'slash' NOT NULL;
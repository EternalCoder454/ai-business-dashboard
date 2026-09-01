CREATE TABLE "wiki_pages" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"title" text NOT NULL,
	"blurb" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_pages_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "wiki_title" text DEFAULT 'Internal Wiki' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "wiki_subtitle" text DEFAULT '2 minute read' NOT NULL;--> statement-breakpoint
CREATE INDEX "wiki_owner_idx" ON "wiki_pages" USING btree ("user_email","sort_order");
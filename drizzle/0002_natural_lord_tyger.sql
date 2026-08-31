CREATE TABLE "projects" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"accent" text DEFAULT 'violet' NOT NULL,
	"due_on" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "project_id" text;--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("user_email","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_project_idx" ON "conversations" USING btree ("user_email","project_id");
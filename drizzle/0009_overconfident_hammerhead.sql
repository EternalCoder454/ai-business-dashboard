CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"owner_email" text NOT NULL,
	"member_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_owner_email_project_id_member_email_pk" PRIMARY KEY("owner_email","project_id","member_email")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author_email" text;--> statement-breakpoint
CREATE INDEX "project_members_member_idx" ON "project_members" USING btree ("member_email");
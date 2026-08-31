CREATE TABLE "tasks" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"department_id" text NOT NULL,
	"project_id" text,
	"due_at" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_conversation_id" text,
	"completed_at" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("user_email","status","sort_order");
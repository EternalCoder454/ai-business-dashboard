CREATE TABLE "all_hands_rounds" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"run_id" text NOT NULL,
	"question" text NOT NULL,
	"responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synthesis" text,
	"synthesis_error" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "all_hands_rounds_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE TABLE "all_hands_runs" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "all_hands_runs_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"department_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"department_id" text NOT NULL,
	"status" text DEFAULT 'backlog' NOT NULL,
	"source_conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverables_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"persona_name" text DEFAULT '' NOT NULL,
	"role_title" text NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_ceo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"kind" text NOT NULL,
	"media_type" text NOT NULL,
	"name" text NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	"text_content" text,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"department_id" text,
	"note" text,
	"origin" text DEFAULT 'upload' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"thinking" text,
	"is_error" boolean DEFAULT false NOT NULL,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_email" text PRIMARY KEY NOT NULL,
	"mission" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"brand_voice" text DEFAULT '' NOT NULL,
	"key_facts" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_email" text PRIMARY KEY NOT NULL,
	"model" text DEFAULT 'claude-sonnet-5' NOT NULL,
	"effort" text DEFAULT 'medium' NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"company_name" text DEFAULT 'Eterneon' NOT NULL,
	"company_subtitle" text DEFAULT '' NOT NULL,
	"writing_rules" text DEFAULT '' NOT NULL,
	"room_brevity" text DEFAULT 'tight' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
	"department_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE INDEX "rounds_run_idx" ON "all_hands_rounds" USING btree ("user_email","run_id","sort_order");--> statement-breakpoint
CREATE INDEX "all_hands_owner_idx" ON "all_hands_runs" USING btree ("user_email","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_owner_idx" ON "conversations" USING btree ("user_email","updated_at");--> statement-breakpoint
CREATE INDEX "deliverables_owner_idx" ON "deliverables" USING btree ("user_email","status");--> statement-breakpoint
CREATE INDEX "departments_owner_idx" ON "departments" USING btree ("user_email","sort_order");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("user_email","kind");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("user_email","conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "skills_owner_idx" ON "skills" USING btree ("user_email","department_id");
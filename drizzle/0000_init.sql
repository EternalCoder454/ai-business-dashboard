CREATE TABLE "access" (
	"email" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"note" text,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_signed_in_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_email" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"role_title" text DEFAULT 'Founder' NOT NULL,
	"pronouns" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT '' NOT NULL,
	"expertise" text DEFAULT '' NOT NULL,
	"preferences" text DEFAULT '' NOT NULL,
	"current_focus" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "all_hands_rounds" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"question" text NOT NULL,
	"responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synthesis" text,
	"synthesis_error" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "all_hands_rounds_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "all_hands_runs" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "all_hands_runs_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"department_id" text NOT NULL,
	"project_id" text,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"department_id" text NOT NULL,
	"project_id" text,
	"status" text DEFAULT 'backlog' NOT NULL,
	"source_conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverables_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"personal" boolean DEFAULT false NOT NULL,
	"persona_name" text DEFAULT '' NOT NULL,
	"role_title" text NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"model" text,
	"status" text DEFAULT 'online' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_ceo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_key" text NOT NULL,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" bigint NOT NULL,
	"read_at" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"media_type" text NOT NULL,
	"name" text NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	"text_content" text,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"department_id" text,
	"project_id" text,
	"note" text,
	"origin" text DEFAULT 'upload' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "memory" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"revisit_when" text DEFAULT '' NOT NULL,
	"department_id" text NOT NULL,
	"project_id" text,
	"occurred_at" bigint NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"source_conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"thinking" text,
	"is_error" boolean DEFAULT false NOT NULL,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author_email" text,
	"tool_calls" jsonb,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"sent_at" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"mission" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"brand_voice" text DEFAULT '' NOT NULL,
	"key_facts" text DEFAULT '' NOT NULL,
	"products" text DEFAULT '' NOT NULL,
	"stage" text DEFAULT '' NOT NULL,
	"competitors" text DEFAULT '' NOT NULL,
	"constraints" text DEFAULT '' NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"member_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_workspace_id_project_id_member_email_pk" PRIMARY KEY("workspace_id","project_id","member_email")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"accent" text DEFAULT 'violet' NOT NULL,
	"due_on" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"model" text DEFAULT 'claude-sonnet-5' NOT NULL,
	"effort" text DEFAULT 'medium' NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"company_name" text DEFAULT 'Your Company' NOT NULL,
	"company_subtitle" text DEFAULT '' NOT NULL,
	"writing_rules" text DEFAULT '' NOT NULL,
	"room_brevity" text DEFAULT 'tight' NOT NULL,
	"company_mark" text DEFAULT 'HQ' NOT NULL,
	"company_logo_url" text,
	"sidebar_side" text DEFAULT 'left' NOT NULL,
	"search_shortcut" text DEFAULT 'slash' NOT NULL,
	"wiki_title" text DEFAULT 'Internal Wiki' NOT NULL,
	"wiki_subtitle" text DEFAULT '2 minute read' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"department_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
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
	CONSTRAINT "tasks_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "wiki_pages" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"blurb" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"blocks" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_pages_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "access_revoked_idx" ON "access" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "rounds_run_idx" ON "all_hands_rounds" USING btree ("workspace_id","run_id","sort_order");--> statement-breakpoint
CREATE INDEX "all_hands_ws_idx" ON "all_hands_runs" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_ws_idx" ON "conversations" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_project_idx" ON "conversations" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "deliverables_ws_idx" ON "deliverables" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "departments_ws_idx" ON "departments" USING btree ("workspace_id","sort_order");--> statement-breakpoint
CREATE INDEX "dm_thread_idx" ON "direct_messages" USING btree ("thread_key","sent_at");--> statement-breakpoint
CREATE INDEX "dm_unread_idx" ON "direct_messages" USING btree ("to_email","read_at");--> statement-breakpoint
CREATE INDEX "dm_from_idx" ON "direct_messages" USING btree ("from_email","sent_at");--> statement-breakpoint
CREATE INDEX "files_ws_idx" ON "files" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "memory_ws_idx" ON "memory" USING btree ("workspace_id","archived","occurred_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("workspace_id","conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "project_members_member_idx" ON "project_members" USING btree ("member_email");--> statement-breakpoint
CREATE INDEX "projects_ws_idx" ON "projects" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "skills_ws_idx" ON "skills" USING btree ("workspace_id","department_id");--> statement-breakpoint
CREATE INDEX "tasks_ws_idx" ON "tasks" USING btree ("workspace_id","status","sort_order");--> statement-breakpoint
CREATE INDEX "wiki_ws_idx" ON "wiki_pages" USING btree ("workspace_id","sort_order");
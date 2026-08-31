CREATE TABLE "memory" (
	"id" text NOT NULL,
	"user_email" text NOT NULL,
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
	CONSTRAINT "memory_user_email_id_pk" PRIMARY KEY("user_email","id")
);
--> statement-breakpoint
CREATE INDEX "memory_owner_idx" ON "memory" USING btree ("user_email","archived","occurred_at");
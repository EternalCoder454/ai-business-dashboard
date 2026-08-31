CREATE TABLE "direct_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_key" text NOT NULL,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" bigint NOT NULL,
	"read_at" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dm_thread_idx" ON "direct_messages" USING btree ("thread_key","sent_at");--> statement-breakpoint
CREATE INDEX "dm_unread_idx" ON "direct_messages" USING btree ("to_email","read_at");--> statement-breakpoint
CREATE INDEX "dm_from_idx" ON "direct_messages" USING btree ("from_email","sent_at");
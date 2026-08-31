CREATE TABLE "accounts" (
	"user_email" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"role_title" text DEFAULT 'Founder' NOT NULL,
	"pronouns" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

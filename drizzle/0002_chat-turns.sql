CREATE TABLE "chat_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"turn_id" text NOT NULL,
	"run_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "pending_run_id" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "pending_turn_id" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "codex_credentials" ADD COLUMN "refresh_lease_owner" text;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_turns_turn_id_idx" ON "chat_turns" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "chat_turns_chat_idx" ON "chat_turns" USING btree ("chat_id");
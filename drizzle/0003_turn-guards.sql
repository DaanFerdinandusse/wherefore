ALTER TABLE "itinerary_slots" ADD COLUMN "note_source" text DEFAULT 'advisor' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_asks" ADD COLUMN "turn_id" text;--> statement-breakpoint
ALTER TABLE "trip_asks" ADD COLUMN "checkpoint" jsonb;--> statement-breakpoint
ALTER TABLE "trip_calls" ADD COLUMN "tool_call_id" text;--> statement-breakpoint
ALTER TABLE "trip_calls" ADD COLUMN "step" text;--> statement-breakpoint
ALTER TABLE "trip_calls" ADD COLUMN "idx" integer;--> statement-breakpoint
ALTER TABLE "trip_places" ADD COLUMN "signal_hash" text;--> statement-breakpoint
ALTER TABLE "trip_places" ADD COLUMN "replaced_by" uuid;--> statement-breakpoint
ALTER TABLE "trip_places" ADD COLUMN "replacement_key" text;--> statement-breakpoint
CREATE INDEX "trip_asks_turn_idx" ON "trip_asks" USING btree ("turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_calls_tool_call_step_idx" ON "trip_calls" USING btree ("tool_call_id","step","idx");
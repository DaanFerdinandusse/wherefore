ALTER TABLE "trips" ADD COLUMN "share_first_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "share_last_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "share_opens_tracked" boolean DEFAULT false NOT NULL;
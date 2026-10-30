CREATE TABLE "rise_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" text,
	"rising_place_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fit" double precision,
	"body" text DEFAULT '' NOT NULL,
	"stay" jsonb,
	"dinner" jsonb,
	"candidates" jsonb DEFAULT '{"stay":[],"dinner":[]}'::jsonb NOT NULL,
	"written_by" text,
	"run_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rising_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"radius_m" integer NOT NULL,
	"growing_count" integer NOT NULL,
	"sample_count" integer NOT NULL,
	"cover_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rise_messages" ADD CONSTRAINT "rise_messages_rising_place_id_rising_places_id_fk" FOREIGN KEY ("rising_place_id") REFERENCES "public"."rising_places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rise_messages" ADD CONSTRAINT "rise_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rise_messages_place_client_idx" ON "rise_messages" USING btree ("rising_place_id","client_id");--> statement-breakpoint
CREATE INDEX "rise_messages_owner_idx" ON "rise_messages" USING btree ("owner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "rising_places_slug_idx" ON "rising_places" USING btree ("slug");
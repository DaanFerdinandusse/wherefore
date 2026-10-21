CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "advisor_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" text,
	"place_id" uuid NOT NULL,
	"city" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"place_name" text NOT NULL,
	"search" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advisors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" text,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"home_city" text,
	"taste_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blend_my_taste" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ask_id" uuid NOT NULL,
	"trip_place_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"affinity" numeric(6, 4),
	"score" integer,
	"explainability" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"query" text NOT NULL,
	"entity_id" text,
	"place_id" uuid,
	"match" text DEFAULT 'unmatched' NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"home_city" text,
	"home_lat" double precision,
	"home_lon" double precision,
	"avatar_url" text,
	"notes" text DEFAULT '' NOT NULL,
	"ground_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media_favorites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taste_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taste_tags_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"search" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"date" date,
	"slot" text NOT NULL,
	"trip_place_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"neighborhood" text,
	"lat" double precision,
	"lon" double precision,
	"primary_type" text,
	"types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_level" integer,
	"rating" numeric(3, 2),
	"rating_count" integer,
	"description" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"google_place_id" text,
	"google_cid" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_asks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"label" text NOT NULL,
	"query" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tool_call_id" text,
	"chat_message_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"elapsed_ms" integer,
	"loosened" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"loosened" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"source" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"best_affinity" numeric(6, 4),
	"best_score" integer,
	"explainability" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shared_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"advisor_place_id" uuid,
	"reason" text,
	"status" text DEFAULT 'suggested' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_travelers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"role" text DEFAULT 'guest' NOT NULL,
	"drives_search" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" text,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"destination" jsonb NOT NULL,
	"start_date" date,
	"end_date" date,
	"dates_mode" text DEFAULT 'unset' NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"stage_override" text,
	"share_token" text,
	"shared_at" timestamp with time zone,
	"chat_id" uuid,
	"seed_status" text DEFAULT 'pending' NOT NULL,
	"built_from" jsonb,
	"client_name" text NOT NULL,
	"search" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"active_turn_id" text,
	"active_run_id" text,
	"stop_requested_at" timestamp with time zone,
	"last_error" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codex_credentials" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"account_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_refresh" timestamp with time zone,
	"refresh_lease_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"body" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advisor_places" ADD CONSTRAINT "advisor_places_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_places" ADD CONSTRAINT "ask_places_ask_id_trip_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."trip_asks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_places" ADD CONSTRAINT "ask_places_trip_place_id_trip_places_id_fk" FOREIGN KEY ("trip_place_id") REFERENCES "public"."trip_places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_favorites" ADD CONSTRAINT "client_favorites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_favorites" ADD CONSTRAINT "client_favorites_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_slots" ADD CONSTRAINT "itinerary_slots_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_slots" ADD CONSTRAINT "itinerary_slots_trip_place_id_trip_places_id_fk" FOREIGN KEY ("trip_place_id") REFERENCES "public"."trip_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_asks" ADD CONSTRAINT "trip_asks_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_calls" ADD CONSTRAINT "trip_calls_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_advisor_place_id_advisor_places_id_fk" FOREIGN KEY ("advisor_place_id") REFERENCES "public"."advisor_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_travelers" ADD CONSTRAINT "trip_travelers_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_travelers" ADD CONSTRAINT "trip_travelers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advisor_places_owner_place_idx" ON "advisor_places" USING btree ("owner_id","place_id");--> statement-breakpoint
CREATE INDEX "advisor_places_owner_city_idx" ON "advisor_places" USING btree ("owner_id","city");--> statement-breakpoint
CREATE INDEX "advisor_places_search_trgm_idx" ON "advisor_places" USING gin ("search" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "advisors_user_id_idx" ON "advisors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_places_ask_trip_place_idx" ON "ask_places" USING btree ("ask_id","trip_place_id");--> statement-breakpoint
CREATE INDEX "ask_places_ask_rank_idx" ON "ask_places" USING btree ("ask_id","rank");--> statement-breakpoint
CREATE INDEX "client_favorites_client_idx" ON "client_favorites" USING btree ("client_id","position");--> statement-breakpoint
CREATE INDEX "clients_owner_idx" ON "clients" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "clients_search_trgm_idx" ON "clients" USING gin ("search" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_slots_trip_day_slot_pos_idx" ON "itinerary_slots" USING btree ("trip_id","day","slot","position");--> statement-breakpoint
CREATE INDEX "itinerary_slots_trip_day_idx" ON "itinerary_slots" USING btree ("trip_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "places_entity_id_idx" ON "places" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "places_name_trgm_idx" ON "places" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "places_google_place_id_idx" ON "places" USING btree ("google_place_id");--> statement-breakpoint
CREATE INDEX "trip_asks_trip_idx" ON "trip_asks" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_asks_tool_call_idx" ON "trip_asks" USING btree ("tool_call_id");--> statement-breakpoint
CREATE INDEX "trip_calls_trip_idx" ON "trip_calls" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_places_trip_place_idx" ON "trip_places" USING btree ("trip_id","place_id");--> statement-breakpoint
CREATE INDEX "trip_places_trip_status_idx" ON "trip_places" USING btree ("trip_id","status");--> statement-breakpoint
CREATE INDEX "trip_travelers_trip_idx" ON "trip_travelers" USING btree ("trip_id","position");--> statement-breakpoint
CREATE INDEX "trips_owner_updated_idx" ON "trips" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_share_token_idx" ON "trips" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "trips_search_trgm_idx" ON "trips" USING gin ("search" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "chats_trip_idx" ON "chats" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "chats_owner_idx" ON "chats" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "api_cache_expires_idx" ON "api_cache" USING btree ("expires_at");
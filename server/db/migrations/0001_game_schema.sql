CREATE TYPE "public"."asset_category" AS ENUM('pl', 'eu', 'world', 'commodity', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."instrument_type" AS ENUM('stock', 'index', 'commodity', 'crypto');--> statement-breakpoint
CREATE TABLE "instrument" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"exchange" text,
	"currency" char(3) NOT NULL,
	"type" "instrument_type" NOT NULL,
	"category" "asset_category",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument_price" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"close" numeric NOT NULL,
	CONSTRAINT "instrument_price_symbol_date_pk" PRIMARY KEY("symbol","date")
);
--> statement-breakpoint
CREATE TABLE "pick" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pick_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"category" "asset_category" NOT NULL,
	"symbol" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "season_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"year" integer NOT NULL,
	"entry_opens_at" timestamp with time zone NOT NULL,
	"entry_closes_at" timestamp with time zone NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"categories" "asset_category"[] DEFAULT '{"pl","eu","world"}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "season_year_unique" UNIQUE("year")
);
--> statement-breakpoint
ALTER TABLE "instrument_price" ADD CONSTRAINT "instrument_price_symbol_instrument_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."instrument"("symbol") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick" ADD CONSTRAINT "pick_symbol_instrument_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."instrument"("symbol") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "pick_season_user_category_uq" ON "pick" USING btree ("season_id","user_id","category");--> statement-breakpoint
CREATE INDEX "pick_symbol_idx" ON "pick" USING btree ("symbol");
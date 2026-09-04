CREATE TABLE "equipment" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"category" text,
	"total_stock" integer DEFAULT 0 NOT NULL,
	"repair_count" integer DEFAULT 0 NOT NULL,
	"discard_count" integer DEFAULT 0 NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "equipment_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "equipment_rentals" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"renter" text NOT NULL,
	"purpose" text,
	"out_date" date NOT NULL,
	"in_date" date,
	"note" text,
	"updated_by" text,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "equipment_rentals" ADD CONSTRAINT "equipment_rentals_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_rentals_equipment_idx" ON "equipment_rentals" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "equipment_rentals_open_idx" ON "equipment_rentals" USING btree ("in_date");
ALTER TABLE "rate_items" ADD COLUMN "amount_after" integer;--> statement-breakpoint
ALTER TABLE "rate_items" ADD COLUMN "tier_limit" real;--> statement-breakpoint
ALTER TABLE "rate_items" ADD COLUMN "region_group" text;
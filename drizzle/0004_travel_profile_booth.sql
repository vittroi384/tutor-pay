ALTER TABLE "instructors" ADD COLUMN "photo" text;--> statement-breakpoint
ALTER TABLE "instructors" ADD COLUMN "specialty" text;--> statement-breakpoint
ALTER TABLE "instructors" ADD COLUMN "career" text;--> statement-breakpoint
ALTER TABLE "lectures" ADD COLUMN "travel_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO "pay_types" ("code","sort","role_based","manual","color","is_active","note") VALUES
 ('부스',8,false,true,'violet',true,'행사 부스 운영 — 단가 직접 입력')
ON CONFLICT ("code") DO NOTHING;

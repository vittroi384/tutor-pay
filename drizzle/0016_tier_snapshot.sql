ALTER TABLE "lectures" ADD COLUMN "unit_price_after" integer;--> statement-breakpoint
ALTER TABLE "lectures" ADD COLUMN "tier_limit" real;--> statement-breakpoint
-- 기존 강의 역산 채움: 세전이 단가×차시와 다르고 차시>2이면 "3차시부터 단가" = (세전 − 단가×2) ÷ (차시 − 2). 정수로 떨어지는 경우만.
UPDATE "lectures" SET "unit_price_after" = (("gross_amount" - "unit_price" * 2)::numeric / ("sessions" - 2))::int, "tier_limit" = 2
WHERE "sessions" > 2 AND "unit_price" > 0 AND "manual_price" IS NULL
  AND "gross_amount" <> round("unit_price" * "sessions")
  AND (("gross_amount" - "unit_price" * 2)::numeric / ("sessions" - 2)) = floor(("gross_amount" - "unit_price" * 2)::numeric / ("sessions" - 2))
  AND "unit_price_after" IS NULL;

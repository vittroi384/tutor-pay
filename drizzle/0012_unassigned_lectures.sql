ALTER TABLE "lectures" ALTER COLUMN "instructor_id" DROP NOT NULL;--> statement-breakpoint
-- B등급·연구원 단가는 2026-08 버전에서 전부 0원 (미사용 — 필요 시 화면에서 새 버전으로 설정)
UPDATE "rate_items" SET "amount" = 0, "amount_after" = NULL, "tier_limit" = NULL
WHERE "rate_table_id" = (SELECT id FROM "rate_tables" WHERE "effective_from" = '2026-08-26')
  AND "grade_id" IN (SELECT id FROM "grades" WHERE "code" IN ('B등급', '연구원'));
